/**
 * 工具链接力：把处理结果暂存到 IndexedDB，让下一个工具页免重新上传。
 *
 * 单槽设计（固定 key）：只保留最近一次交接，新的交接会覆盖旧的；
 * 读取后即删除（一次性消费），不会在用户设备上累积数据。
 */

const DB_NAME = 'dofupdf-handoff';
const STORE = 'files';
const RECORD_KEY = 'latest';

export interface HandoffRecord {
  blob: Blob;
  name: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 把处理结果写入交接槽（覆盖上一次）。 */
export async function saveHandoff(blob: Blob, name: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob, name }, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** 读取并删除交接的结果（一次性）；没有则返回 null。 */
export async function takeHandoff(): Promise<HandoffRecord | null> {
  const db = await openDb();
  try {
    return await new Promise<HandoffRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.get(RECORD_KEY);
      let record: HandoffRecord | null = null;
      request.onsuccess = () => {
        record = (request.result as HandoffRecord | undefined) ?? null;
      };
      store.delete(RECORD_KEY);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
