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
 * License endpoints (Dodo Payments): the browser talks only to these same-origin
 * routes. The worker calls Dodo's public activate/validate/deactivate endpoints;
 * no API key or other secret is required or stored in the browser. Dodo enforces
 * the product's three-activation limit, while LICENSE_KV maps our anonymous
 * device IDs to Dodo activation instance IDs and enforces the same limit locally.
 *
 * KV scheme: key = act:{sha256(key + ':' + deviceId)}, value = JSON containing
 * only sha256(key), the Dodo instance ID and product ID; metadata.key = sha256(key).
 * Plaintext license keys are never stored. Legacy value formats remain readable
 * for local DEMO data, but cannot activate the Dodo production path.
 *
 * DEMO mode is opt-in via ALLOW_DEMO=true in local .dev.vars. Production needs
 * no secret environment variable. PDFs and passwords never leave the device.
 */
const DEMO_KEY = 'DEMO-PRO-0000-0000';
const DODO_API = 'https://live.dodopayments.com';
const DODO_PRODUCT_ID = 'pdt_0Ns9DCqpzbuvkd7JKpHXX';
const DODO_TIMEOUT_MS = 10_000;
// KV count-then-write is not atomic (accepted limitation). Dodo's own activation
// limit is authoritative and closes the same-key race at the upstream service.
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

/** DEMO is only for local development via ALLOW_DEMO=true in .dev.vars. */
function demoAllowed(env) {
  return env.ALLOW_DEMO === 'true' || env.ALLOW_DEMO === true;
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function keyDigest(licenseKey) {
  return sha256Hex(licenseKey);
}

async function activationKey(licenseKey, deviceId) {
  return `act:${await sha256Hex(`${licenseKey}:${deviceId}`)}`;
}

/** Timeout and malformed upstream answers become null, never "invalid key". */
async function dodoRequest(path, body) {
  let res;
  try {
    res = await fetch(`${DODO_API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DODO_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function dodoValidate(licenseKey, instanceId) {
  return dodoRequest('/licenses/validate', {
    license_key: licenseKey,
    ...(instanceId ? { license_key_instance_id: instanceId } : {}),
  });
}

async function dodoActivate(licenseKey) {
  // Do not send our anonymous device ID to Dodo; the instance name is generic.
  return dodoRequest('/licenses/activate', {
    license_key: licenseKey,
    name: 'DofuPDF Web',
  });
}

async function dodoDeactivate(licenseKey, instanceId) {
  return dodoRequest('/licenses/deactivate', {
    license_key: licenseKey,
    license_key_instance_id: instanceId,
  });
}

/** Count this key's device records without storing or listing plaintext keys. */
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

/** Return the activation record, lazily converting legacy values to JSON. */
async function findActivation(kv, licenseKey, deviceId) {
  const kvKey = await activationKey(licenseKey, deviceId);
  const stored = await kv.get(kvKey);
  if (stored === null) return null;
  const digest = await keyDigest(licenseKey);
  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.key === digest) {
      return {
        instanceId: typeof parsed.instanceId === 'string' ? parsed.instanceId : null,
        productId: typeof parsed.productId === 'string' ? parsed.productId : null,
      };
    }
  } catch {
    // Pre-Dodo and early DEMO values contained only the key digest/plaintext.
  }
  if (stored === digest || stored === licenseKey) {
    const record = { key: digest, instanceId: null, productId: null };
    await kv.put(kvKey, JSON.stringify(record), { metadata: { key: digest } });
    return { instanceId: null, productId: null };
  }
  return null;
}

async function writeActivation(kv, licenseKey, deviceId, instanceId, productId) {
  const digest = await keyDigest(licenseKey);
  await kv.put(await activationKey(licenseKey, deviceId), JSON.stringify({
    key: digest,
    instanceId,
    productId,
  }), { metadata: { key: digest } });
}

async function deleteActivation(kv, licenseKey, deviceId) {
  const kvKey = await activationKey(licenseKey, deviceId);
  const record = await findActivation(kv, licenseKey, deviceId);
  if (record) await kv.delete(kvKey);
  return record;
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

function upstreamUnavailable() {
  return json({ ok: false, error: 'upstream_unavailable' }, { status: 502 });
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

  const demo = demoAllowed(env);
  const kv = env.LICENSE_KV ?? null;

  if (demo) {
    if (key !== DEMO_KEY) {
      if (action === 'status') {
        return json({ valid: false, activatedOnThisDevice: false, devices: 0 }, { demo: true });
      }
      return invalidKey(true);
    }
    if (!kv) {
      if (action === 'activate') return json({ ok: true, remaining: DEVICE_LIMIT - 1 }, { demo: true });
      if (action === 'status') {
        return json({ valid: true, activatedOnThisDevice: false, devices: 0 }, { demo: true });
      }
      return json({ ok: true }, { demo: true });
    }
    if (action === 'activate') {
      if (await findActivation(kv, key, deviceId)) {
        return json(
          { ok: true, remaining: Math.max(0, DEVICE_LIMIT - (await countDevices(kv, key))) },
          { demo: true },
        );
      }
      const devices = await countDevices(kv, key);
      if (devices >= DEVICE_LIMIT) return deviceLimitReached(true);
      await writeActivation(kv, key, deviceId, `demo:${deviceId}`, 'demo');
      return json({ ok: true, remaining: Math.max(0, DEVICE_LIMIT - devices - 1) }, { demo: true });
    }
    if (action === 'status') {
      return json(
        {
          valid: true,
          activatedOnThisDevice: Boolean(await findActivation(kv, key, deviceId)),
          devices: await countDevices(kv, key),
        },
        { demo: true },
      );
    }
    await deleteActivation(kv, key, deviceId);
    return json({ ok: true }, { demo: true });
  }

  if (key === DEMO_KEY) return invalidKey(false);

  try {
    if (action === 'activate') {
      if (!kv) return json({ error: 'server_misconfig' }, { status: 500 });
      const existing = await findActivation(kv, key, deviceId);
      if (existing?.instanceId && existing.productId === DODO_PRODUCT_ID) {
        const current = await dodoValidate(key, existing.instanceId);
        if (!current) return upstreamUnavailable();
        if (current.ok && current.data?.valid === true) {
          return json({
            ok: true,
            remaining: Math.max(0, DEVICE_LIMIT - (await countDevices(kv, key))),
          });
        }
        const invalid = current.status === 403 || current.status === 404
          || current.status === 422 || current.data?.valid === false;
        if (!invalid) return upstreamUnavailable();
        await deleteActivation(kv, key, deviceId);
        return invalidKey(false);
      }
      if (existing) await deleteActivation(kv, key, deviceId);

      const devices = await countDevices(kv, key);
      if (devices >= DEVICE_LIMIT) return deviceLimitReached(false);

      const activated = await dodoActivate(key);
      if (!activated) return upstreamUnavailable();
      if (activated.status === 422) return deviceLimitReached(false);
      if (activated.status === 403 || activated.status === 404) return invalidKey(false);
      if (!activated.ok) return upstreamUnavailable();
      const instanceId = activated.data?.id;
      const productId = activated.data?.product?.product_id;
      if (typeof instanceId !== 'string' || !instanceId) return upstreamUnavailable();
      if (productId !== DODO_PRODUCT_ID) {
        // Do not consume an activation on another merchant product's key.
        await dodoDeactivate(key, instanceId);
        return invalidKey(false);
      }
      try {
        await writeActivation(kv, key, deviceId, instanceId, productId);
      } catch {
        await dodoDeactivate(key, instanceId);
        return upstreamUnavailable();
      }
      return json({ ok: true, remaining: Math.max(0, DEVICE_LIMIT - devices - 1) });
    }

    if (action === 'status') {
      if (!kv) return json({ error: 'server_misconfig' }, { status: 500 });
      const activation = await findActivation(kv, key, deviceId);
      const usableInstance = activation?.instanceId && activation.productId === DODO_PRODUCT_ID
        ? activation.instanceId
        : null;
      const verified = await dodoValidate(key, usableInstance ?? undefined);
      if (!verified) return upstreamUnavailable();
      if (verified.status === 403 || verified.status === 404 || verified.data?.valid === false) {
        return json({ valid: false, activatedOnThisDevice: false, devices: 0 });
      }
      if (!verified.ok || verified.data?.valid !== true) return upstreamUnavailable();
      return json({
        valid: true,
        activatedOnThisDevice: Boolean(usableInstance),
        devices: await countDevices(kv, key),
      });
    }

    if (!kv) return json({ error: 'server_misconfig' }, { status: 500 });
    const activation = await findActivation(kv, key, deviceId);
    if (!activation) return json({ ok: true });
    if (activation.instanceId && activation.productId === DODO_PRODUCT_ID) {
      const deactivated = await dodoDeactivate(key, activation.instanceId);
      if (!deactivated) return upstreamUnavailable();
      if (!deactivated.ok && deactivated.status !== 404) return upstreamUnavailable();
    }
    await deleteActivation(kv, key, deviceId);
    return json({ ok: true });
  } catch {
    return upstreamUnavailable();
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
