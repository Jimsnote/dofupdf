/**
 * Pro license client state (W2.5, Payhip). The browser only ever sends the
 * license key and an anonymous device id to our own worker routes
 * (/api/license/*) — PDFs and passwords never leave the device. The record
 * lives in localStorage; validation results are cached for 7 days, and a
 * failed revalidation downgrades to the free tier.
 */

export interface StoredLicense {
  key: string;
  cached_at: number;
  /** Worker answered in DEMO mode (no Payhip env configured). */
  demo: boolean;
}

const STORAGE_KEY = 'dofupdf-license';
const DEVICE_STORAGE_KEY = 'dofupdf-device-id';
const VALIDATE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Anonymous stable per-browser id (UUID v4) — the unit the worker counts
 * against the 3-device quota. Generated on first use, kept in localStorage.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

/** 状態変化を購読するための簡易イベント（同一タブ内）。 */
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
export function subscribeLicense(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readLicense(): StoredLicense | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLicense> | null;
    // 旧 W2 形式（instance_id を持つレコード）も key/cached_at さえあれば読み継ぐ
    if (typeof parsed?.key !== 'string' || typeof parsed.cached_at !== 'number') return null;
    return { key: parsed.key, cached_at: parsed.cached_at, demo: parsed.demo === true };
  } catch {
    return null;
  }
}

function writeLicense(record: StoredLicense | null): void {
  try {
    if (record) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    else window.localStorage.removeItem(STORAGE_KEY);
  } finally {
    emit();
  }
}

/** Synchronous Pro check for gating UI (no network). */
export function isProActive(): boolean {
  return readLicense() !== null;
}

export function isDemoLicense(): boolean {
  return readLicense()?.demo === true;
}

interface ApiResult {
  ok: boolean;
  error?: string;
  /** Worker が返した日本語メッセージ（あれば UI にそのまま出す）。 */
  message?: string;
}

async function post<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: T | null; demo: boolean }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const demo = res.headers.get('x-license-mode') === 'demo';
  const data = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, data, demo };
}

// type aliases (not interfaces) so they satisfy post<T>'s Record<string, unknown> constraint
type ActivateResponse = {
  ok?: boolean;
  remaining?: number;
  error?: string;
  message?: string;
};

type StatusResponse = {
  valid?: boolean;
  activatedOnThisDevice?: boolean;
  devices?: number;
};

/** Activates a key on this device and stores it. */
export async function activateLicense(key: string): Promise<ApiResult> {
  const trimmed = key.trim();
  const deviceId = getDeviceId();
  if (!trimmed) return { ok: false, error: 'missing_key' };
  if (!deviceId) return { ok: false, error: 'network' };
  try {
    const { status, data, demo } = await post<ActivateResponse>('/api/license/activate', {
      key: trimmed,
      deviceId,
    });
    if (status !== 200 || !data?.ok) {
      const error = data?.error ?? 'invalid_key';
      // 通信系の失敗（レート制限・上流障害・5xx）は「確認できませんでした」系に寄せる
      const transient = status === 429 || status >= 500 || error === 'upstream_unavailable';
      return { ok: false, error: transient ? 'network' : error, message: data?.message };
    }
    writeLicense({ key: trimmed, cached_at: Date.now(), demo });
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * Revalidates the stored key via /api/license/status. Results under 7 days
 * old are trusted without a network call. A key that is no longer valid —
 * or that is no longer activated on THIS device — REMOVES the stored license
 * (downgrade to free) and returns 'invalid'. Upstream trouble (5xx / rate
 * limit) and network errors keep the current state ('unknown') so offline
 * use keeps working.
 */
export async function validateStoredLicense(): Promise<'valid' | 'invalid' | 'unknown'> {
  const stored = readLicense();
  if (!stored) return 'invalid';
  if (Date.now() - stored.cached_at < VALIDATE_CACHE_MS) return 'valid';
  const deviceId = getDeviceId();
  if (!deviceId) return 'unknown';
  try {
    const { status, data, demo } = await post<StatusResponse>('/api/license/status', {
      key: stored.key,
      deviceId,
    });
    if (status === 200 && data?.valid === true && data.activatedOnThisDevice === true) {
      writeLicense({ ...stored, cached_at: Date.now(), demo });
      return 'valid';
    }
    if (status === 429 || status >= 500) return 'unknown';
    writeLicense(null);
    return 'invalid';
  } catch {
    return 'unknown';
  }
}

/** Deactivates this device and clears the stored key. */
export async function deactivateLicense(): Promise<void> {
  const stored = readLicense();
  const deviceId = getDeviceId();
  if (stored && deviceId) {
    try {
      await post('/api/license/deactivate', { key: stored.key, deviceId });
    } catch {
      // 通信に失敗しても端末側のライセンスは外す
    }
  }
  writeLicense(null);
}
