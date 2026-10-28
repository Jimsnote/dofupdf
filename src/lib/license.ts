/**
 * Pro license client state (W2/W3). The browser only ever sends the license
 * key to our own worker routes (/api/license/*) — PDFs and passwords never
 * leave the device. The record lives in localStorage; validation results are
 * cached for 7 days, and a failed revalidation downgrades to the free tier.
 */

export interface StoredLicense {
  key: string;
  instance_id: string;
  cached_at: number;
  /** Worker answered in DEMO mode (no Lemon Squeezy env configured). */
  demo: boolean;
}

const STORAGE_KEY = 'dofupdf-license';
const VALIDATE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

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
    const parsed = JSON.parse(raw) as StoredLicense;
    if (typeof parsed.key !== 'string' || typeof parsed.instance_id !== 'string') return null;
    return parsed;
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
}

async function post<T extends Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; demo: boolean; error?: string }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const demo = res.headers.get('x-license-mode') === 'demo';
  const data = (await res.json().catch(() => null)) as T | null;
  if (!data) return { data: null, demo, error: 'bad_response' };
  return { data, demo };
}

/** Activates a key on this device and stores it. */
export async function activateLicense(key: string): Promise<ApiResult> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: 'missing_key' };
  try {
    const { data, demo } = await post<{ valid?: boolean; instance_id?: string | null; error?: string }>(
      '/api/license/activate',
      { key: trimmed },
    );
    if (!data?.valid || typeof data.instance_id !== 'string') {
      return { ok: false, error: data?.error ?? 'invalid_key' };
    }
    writeLicense({
      key: trimmed,
      instance_id: data.instance_id,
      cached_at: Date.now(),
      demo,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * Revalidates the stored key. Results under 7 days old are trusted without a
 * network call; a failed revalidation REMOVES the stored license (downgrade
 * to free) and returns 'invalid'. Network trouble keeps the current state
 * ('unknown') — offline use keeps working.
 */
export async function validateStoredLicense(): Promise<'valid' | 'invalid' | 'unknown'> {
  const stored = readLicense();
  if (!stored) return 'invalid';
  if (Date.now() - stored.cached_at < VALIDATE_CACHE_MS) return 'valid';
  try {
    const { data } = await post<{ valid?: boolean }>('/api/license/validate', {
      key: stored.key,
      instance_id: stored.instance_id,
    });
    if (data?.valid) {
      writeLicense({ ...stored, cached_at: Date.now() });
      return 'valid';
    }
    writeLicense(null);
    return 'invalid';
  } catch {
    return 'unknown';
  }
}

/** Deactivates this device and clears the stored key. */
export async function deactivateLicense(): Promise<void> {
  const stored = readLicense();
  if (stored) {
    try {
      await post('/api/license/deactivate', {
        key: stored.key,
        instance_id: stored.instance_id,
      });
    } catch {
      // 通信に失敗しても端末側のライセンスは外す
    }
  }
  writeLicense(null);
}
