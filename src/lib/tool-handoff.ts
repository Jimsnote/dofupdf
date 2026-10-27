/**
 * 工具链接力：把处理结果暂存到 IndexedDB，让下一个工具页免重新上传。
 *
 * 设计要点：
 * - 每条交接有随机 transfer ID（URL 参数传递）、目标工具绑定和创建时间；
 * - TTL 24 小时，过期/遗弃记录在写入和读取路径上都会被清理；
 * - 旧版固定键 `latest` 的记录视为旧数据，打开时迁移删除；
 * - 读取＝原子 get+delete（一次性消费），同一 tab 内的 effect replay 或
 *   并发调用共享同一个 consumption promise，Strict Mode 下也只消费一次。
 */

const DB_NAME = 'dofupdf-handoff';
const STORE = 'files';
/** 旧版单槽键（迁移时删除）。 */
const LEGACY_KEY = 'latest';
const TTL_MS = 24 * 60 * 60 * 1000;

export interface HandoffRecord {
  id: string;
  /** 交接目标工具的 slug（如 `compress-pdf`）。 */
  target: string;
  name: string;
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 过期或旧版记录删除（写入/读取路径共用）。 */
async function cleanup(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const now = Date.now();
  await new Promise<void>((resolve) => {
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      const value = cursor.value as Partial<HandoffRecord> | undefined;
      const stale =
        cursor.key === LEGACY_KEY ||
        typeof value?.createdAt !== 'number' ||
        now - value.createdAt > TTL_MS;
      if (stale) cursor.delete();
      cursor.continue();
    };
    cursorRequest.onerror = () => resolve(); // 清理失败不影响主流程
  });
  await txDone(tx).catch(() => {});
}

/**
 * 把处理结果写入交接记录，返回 transfer ID。同时清理过期/旧版记录。
 */
export async function saveHandoff(blob: Blob, name: string, target: string): Promise<string> {
  const id = crypto.randomUUID();
  const db = await openDb();
  try {
    await cleanup(db);
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id, target, name, blob, createdAt: Date.now() } satisfies HandoffRecord, id);
    await txDone(tx);
  } finally {
    db.close();
  }
  return id;
}

async function takeHandoffOnce(id: string, target: string): Promise<HandoffRecord | null> {
  const db = await openDb();
  try {
    return await new Promise<HandoffRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      let record: HandoffRecord | null = null;
      request.onsuccess = () => {
        const value = request.result as HandoffRecord | undefined;
        if (!value) return;
        const expired = typeof value.createdAt !== 'number' || Date.now() - value.createdAt > TTL_MS;
        // 目标不匹配的记录不消费（用户可能是开错了工具页），过期才删除。
        if (expired) {
          store.delete(id);
          return;
        }
        if (value.target !== target) return;
        record = value;
        store.delete(id);
      };
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** tab 内共享的 consumption promise（Strict Mode replay/并发也只消费一次）。 */
const consumption = new Map<string, Promise<HandoffRecord | null>>();

/** 读取并删除交接记录（一次性）。目标不匹配或过期返回 null（不消费有效记录）。 */
export function takeHandoff(id: string, target: string): Promise<HandoffRecord | null> {
  const key = `${id}:${target}`;
  const existing = consumption.get(key);
  if (existing) return existing;
  const promise = takeHandoffOnce(id, target);
  consumption.set(key, promise);
  // 记录已被删除，replay 也安全；promise 常驻 map 即可（每 id 只一次）。
  return promise;
}
