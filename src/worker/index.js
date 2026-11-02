/**
 * DofuPDF site worker: returns HTTP 410 Gone for the 43 pages retired in the
 * W1 consolidation (all non-password tools and guides), and forwards every
 * other request to the static assets. Static assets win for existing files;
 * this worker only sees requests that would otherwise 404.
 *
 * The list is the single source of truth for the retirement — keep it in
 * sync with src/lib/tools.ts (status 'offline') and src/lib/guides/index.ts.
 */

const GONE_TOOLS = [
  'merge-pdf',
  'split-pdf',
  'compress-pdf',
  'receipt-sheet',
  'rotate-pdf',
  'organize-pdf',
  'remove-pages',
  'extract-pages',
  'reorder-pages',
  'docx-to-markdown',
  'xlsx-to-markdown',
  'extract-images',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'heic-to-pdf',
  'sign-pdf',
  'hanko-pdf',
  'invoice-rename',
  'pdf-check',
  'watermark-pdf',
  'page-numbers',
  'pdf-to-markdown',
  'qr-code',
  'ocr-pdf',
];

const GONE_GUIDES = [
  'how-to-merge-pdf',
  'how-to-split-pdf',
  'how-to-compress-pdf',
  'how-to-rotate-pdf',
  'how-to-organize-pdf-pages',
  'how-to-remove-pages-from-pdf',
  'how-to-extract-pages-from-pdf',
  'how-to-convert-pdf-to-jpg',
  'how-to-convert-jpg-to-pdf',
  'how-to-add-watermark-to-pdf',
  'how-to-add-page-numbers-to-pdf',
  'how-to-print-receipts-on-one-a4',
  'how-to-add-hanko-seal-to-pdf',
  'how-to-rename-invoice-pdfs',
  'how-to-check-pdf-before-submitting',
  'how-to-convert-pdf-to-markdown',
  'how-to-convert-docx-to-markdown',
  'how-to-convert-xlsx-to-markdown',
  '5-pdf-tools-that-dont-upload-your-files',
];

const GONE_PATHS = new Set([
  ...GONE_TOOLS.map((slug) => `/${slug}`),
  ...GONE_GUIDES.map((slug) => `/guides/${slug}`),
]);

const BODY = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>このページは終了しました | DofuPDF</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1e293b; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.7; }
  h1 { font-size: 1.4rem; }
  a { color: #4f46e5; }
</style>
</head>
<body>
<h1>410 — このページは終了しました</h1>
<p>このページは提供を終了しました。DofuPDFは現在、PDFパスワード関連のツールに特化して運営しています。</p>
<p><a href="/">トップページへ</a> ／ <a href="/pdf-password/">PDFパスワードのすべて</a></p>
</body>
</html>
`;

/**
 * License endpoints (W2.5, Payhip): the browser never holds the Payhip
 * product secret — it only talks to these routes, and the worker calls the
 * Payhip License API (base https://payhip.com/api/v2, auth header
 * `product-secret-key`). Payhip has no hard activation cap, so the 3-device
 * quota is enforced HERE with Workers KV (`LICENSE_KV`) as the authoritative
 * record. KV scheme (batch B, hashed): key = `act:{sha256(key + ':' + deviceId)}`,
 * value = sha256(key), metadata.key = sha256(key) — the plaintext license key
 * is never stored, so a leaked KV dump cannot enumerate keys. Entries written
 * before batch B hold the plaintext key in value+metadata; every read path
 * accepts both forms and lazily rewrites legacy entries into the hashed
 * format, so no KV wipe is needed.
 *
 * DEMO mode is fail-closed (batch B): without PAYHIP_PRODUCT_SECRET the
 * license API answers 503 `license_unavailable` unless ALLOW_DEMO is
 * explicitly enabled (local development via `.dev.vars`; never in
 * production). With ALLOW_DEMO the key DEMO-PRO-0000-0000 behaves like a
 * real Pro key (same KV-based quota), and responses carry
 * `X-License-Mode: demo` so the UI can show a DEMO badge.
 *
 * Privacy: only the license key and the anonymous device id travel. PDFs and
 * passwords never do.
 */
const DEMO_KEY = 'DEMO-PRO-0000-0000';
const PAYHIP_API = 'https://payhip.com/api/v2';
// Known limitation (accepted): KV is eventually consistent and
// count-then-write is not atomic, so two devices activating the same key in
// the same instant can both pass the DEVICE_LIMIT check (TOCTOU). Beating the
// limit requires the key holder to race their own key, so the real-world
// threat is low; a Durable Object would be the fix if it ever matters.
const DEVICE_LIMIT = 3;

/** Naive per-IP rate limit: 10 requests/minute (in-memory, per isolate). */
const rateBuckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) ?? { start: now, count: 0 };
  if (now - bucket.start > 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (rateBuckets.size > 10_000) {
    // Evict the oldest buckets (never clear() — a flood of forged IPs must
    // not reset everyone's remaining allowance).
    const oldestFirst = [...rateBuckets.entries()].sort((a, b) => a[1].start - b[1].start);
    for (const [key] of oldestFirst.slice(0, rateBuckets.size - 8_000)) {
      rateBuckets.delete(key);
    }
  }
  return bucket.count > 10;
}

function json(data, { status = 200, demo = false } = {}) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (demo) headers['x-license-mode'] = 'demo';
  return new Response(JSON.stringify(data), { status, headers });
}

function licenseEnvReady(env) {
  return Boolean(env.PAYHIP_PRODUCT_SECRET);
}

/**
 * ALLOW_DEMO gate (batch B): DEMO mode is opt-in for local development
 * (`.dev.vars` / wrangler dev). Never set it in production — with the real
 * secret configured it has no effect either way.
 */
function demoAllowed(env) {
  return env.ALLOW_DEMO === 'true' || env.ALLOW_DEMO === true;
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** sha256(licenseKey) hex — the only form of the key that is ever stored. */
async function keyDigest(licenseKey) {
  return sha256Hex(licenseKey);
}

/** KV key for one (license key, device) activation pair. */
async function activationKey(licenseKey, deviceId) {
  return `act:${await sha256Hex(`${licenseKey}:${deviceId}`)}`;
}

/**
 * Payhip license verify. Returns {enabled} for a well-formed answer and
 * {enabled:false} when the key does not exist: Payhip answers HTTP 400 with
 * body {"data":[],"error":true} for unknown license keys (verified live
 * 2026-10-30), and 404 is kept as a defensive alias. Any other failure —
 * 401 (product secret invalid: an operator alert, deliberately NOT mapped
 * to "invalid key"), 5xx, network error, timeout, unparsable body — returns
 * null so the caller decides how to degrade. 10s timeout: a hanging Payhip
 * must not hang the API.
 */
const PAYHIP_TIMEOUT_MS = 10_000;

async function payhipVerify(env, licenseKey) {
  let res;
  try {
    res = await fetch(`${PAYHIP_API}/license/verify?license_key=${encodeURIComponent(licenseKey)}`, {
      headers: { 'product-secret-key': env.PAYHIP_PRODUCT_SECRET },
      signal: AbortSignal.timeout(PAYHIP_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (res.status === 400 || res.status === 404) return { enabled: false };
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return { enabled: Boolean(data?.data?.enabled) };
}

/** Payhip usage counter: PUT /license/usage (+1) or /license/decrease (-1). */
async function payhipUsage(env, licenseKey, path) {
  try {
    const res = await fetch(`${PAYHIP_API}/license/${path}`, {
      method: 'PUT',
      headers: {
        'product-secret-key': env.PAYHIP_PRODUCT_SECRET,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
      signal: AbortSignal.timeout(PAYHIP_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Count activated devices for one license key. The KV key hashes key and
 * device together, so a single key's devices cannot share a list prefix —
 * the key digest is therefore mirrored into the entry metadata and counted
 * by filtering the global `act:` prefix (KV list returns metadata with no
 * extra reads). Legacy pre-batch-B entries carry the plaintext key in
 * metadata and still count (they migrate on the next findActivation touch).
 */
async function countDevices(kv, licenseKey) {
  const digest = await keyDigest(licenseKey);
  let cursor;
  let count = 0;
  do {
    const page = await kv.list({ prefix: 'act:', cursor });
    for (const entry of page.keys) {
      const metaKey = entry.metadata?.key;
      if (metaKey === digest || metaKey === licenseKey) count += 1;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

/**
 * Whether this (license key, device) pair is activated. A legacy entry that
 * still stores the plaintext key is treated as a match and rewritten into
 * the hashed format in the same breath (lazy migration, no KV wipe).
 */
async function findActivation(kv, licenseKey, deviceId) {
  const kvKey = await activationKey(licenseKey, deviceId);
  const stored = await kv.get(kvKey);
  if (stored === null) return false;
  const digest = await keyDigest(licenseKey);
  if (stored !== digest) {
    await kv.put(kvKey, digest, { metadata: { key: digest } });
  }
  return true;
}

async function writeActivation(kv, licenseKey, deviceId) {
  const digest = await keyDigest(licenseKey);
  await kv.put(await activationKey(licenseKey, deviceId), digest, {
    metadata: { key: digest },
  });
}

/** Deletes the record; returns true when one existed (caller decreases usage). */
async function deleteActivation(kv, licenseKey, deviceId) {
  const kvKey = await activationKey(licenseKey, deviceId);
  const existed = (await kv.get(kvKey)) !== null;
  if (existed) await kv.delete(kvKey);
  return existed;
}

function invalidKey(demo) {
  return json(
    { ok: false, error: 'invalid_key', message: 'ライセンスキーが無効です' },
    { status: 403, demo },
  );
}

function deviceLimitReached(demo) {
  return json(
    { ok: false, error: 'device_limit', message: 'ライセンスは3台までです' },
    { status: 403, demo },
  );
}

async function handleLicense(request, env, action) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (rateLimited(ip)) {
    return json({ error: 'rate_limited' }, { status: 429 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }
  const key = typeof payload.key === 'string' ? payload.key.trim() : '';
  const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId.trim() : '';
  if (!key) return json({ error: 'missing_key' }, { status: 400 });
  if (!deviceId || deviceId.length > 128) return json({ error: 'missing_device' }, { status: 400 });

  const demo = !licenseEnvReady(env);
  if (demo && !demoAllowed(env)) {
    // Fail-closed（批次 B）：无 secret 且未显式开启 ALLOW_DEMO 时，绝不落入
    // 公开 DEMO key —— license API 直接不可用（本地开发请在 .dev.vars 配
    // ALLOW_DEMO=true；生产只配 PAYHIP_PRODUCT_SECRET）。
    return json({ ok: false, error: 'license_unavailable' }, { status: 503 });
  }
  const kv = env.LICENSE_KV ?? null;

  if (demo) {
    // DEMO モード：固定キーのみ受理。3台制限も同じ KV 経路で再現し、本番と同一挙動にする。
    if (key !== DEMO_KEY) {
      if (action === 'status') {
        return json({ valid: false, activatedOnThisDevice: false, devices: 0 }, { demo: true });
      }
      return invalidKey(true);
    }
    if (!kv) {
      // KV バインディング欠落（設定ミス）: 枠チェックを省略して旧 W2 挙動にフォールバック。
      if (action === 'activate') return json({ ok: true, remaining: DEVICE_LIMIT - 1 }, { demo: true });
      if (action === 'status') {
        return json({ valid: true, activatedOnThisDevice: false, devices: 0 }, { demo: true });
      }
      return json({ ok: true }, { demo: true });
    }
    if (action === 'activate') {
      if (await findActivation(kv, key, deviceId)) {
        // 同一端末の再 activate は枠を消費しない
        return json(
          { ok: true, remaining: Math.max(0, DEVICE_LIMIT - (await countDevices(kv, key))) },
          { demo: true },
        );
      }
      const devices = await countDevices(kv, key);
      if (devices >= DEVICE_LIMIT) return deviceLimitReached(true);
      await writeActivation(kv, key, deviceId);
      return json({ ok: true, remaining: Math.max(0, DEVICE_LIMIT - devices - 1) }, { demo: true });
    }
    if (action === 'status') {
      return json(
        {
          valid: true,
          activatedOnThisDevice: await findActivation(kv, key, deviceId),
          devices: await countDevices(kv, key),
        },
        { demo: true },
      );
    }
    // deactivate
    await deleteActivation(kv, key, deviceId);
    return json({ ok: true }, { demo: true });
  }

  // 本番モード：キーの有効性は Payhip、デバイス枠の権威記録は KV。
  try {
    if (action === 'activate') {
      // 仕様: 通信故障(null)は 502 upstream_unavailable（status パスと同一口径）、
      // enabled:false のみ 403「無効」。Payhip 障害中に有効キーを「無効」と
      // 報告しないための区別。
      const verified = await payhipVerify(env, key);
      if (!verified) return json({ ok: false, error: 'upstream_unavailable' }, { status: 502 });
      if (!verified.enabled) return invalidKey(false);
      if (!kv) return json({ error: 'server_misconfig' }, { status: 500 });
      if (await findActivation(kv, key, deviceId)) {
        return json({
          ok: true,
          remaining: Math.max(0, DEVICE_LIMIT - (await countDevices(kv, key))),
        });
      }
      const devices = await countDevices(kv, key);
      if (devices >= DEVICE_LIMIT) return deviceLimitReached(false);
      if (!(await payhipUsage(env, key, 'usage'))) {
        // usage 呼び出しが失敗したら KV には書かず 500（次回リトライでやり直せる）。
        return json({ ok: false, error: 'upstream_unavailable' }, { status: 500 });
      }
      await writeActivation(kv, key, deviceId);
      return json({ ok: true, remaining: Math.max(0, DEVICE_LIMIT - devices - 1) });
    }
    if (action === 'status') {
      const verified = await payhipVerify(env, key);
      if (!verified) return json({ error: 'upstream_unavailable' }, { status: 502 });
      if (!verified.enabled) {
        return json({ valid: false, activatedOnThisDevice: false, devices: 0 });
      }
      if (!kv) return json({ error: 'server_misconfig' }, { status: 500 });
      return json({
        valid: true,
        activatedOnThisDevice: await findActivation(kv, key, deviceId),
        devices: await countDevices(kv, key),
      });
    }
    // deactivate: 記録が存在した端末の分だけ Payhip の使用数を -1。
    const removed = kv ? await deleteActivation(kv, key, deviceId) : false;
    if (removed) await payhipUsage(env, key, 'decrease');
    return json({ ok: true });
  } catch {
    return json({ error: 'upstream_unavailable' }, { status: 502 });
  }
}

const siteWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 末尾スラッシュと大小を正規化してから照合する
    const path = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    if (GONE_PATHS.has(path)) {
      return new Response(BODY, {
        status: 410,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=86400',
        },
      });
    }
    const licenseMatch = /^\/api\/license\/(activate|status|deactivate)$/.exec(path);
    if (licenseMatch) {
      if (request.method !== 'POST') {
        return json({ error: 'method_not_allowed' }, { status: 405 });
      }
      return handleLicense(request, env, licenseMatch[1]);
    }
    return env.ASSETS.fetch(request);
  },
};

export default siteWorker;
