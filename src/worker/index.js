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
 * License endpoints (W2/W3): the browser never holds the Lemon Squeezy API
 * key — it only talks to these routes, and the worker calls the License API.
 * Without env config the worker runs in DEMO mode: the key DEMO-PRO-0000-0000
 * behaves like a real Pro key (for local E2E), and responses carry
 * `X-License-Mode: demo` so the UI can show a DEMO badge.
 *
 * Privacy: only the license key travels. PDFs and passwords never do.
 */
const DEMO_KEY = 'DEMO-PRO-0000-0000';
const LS_API = 'https://api.lemonsqueezy.com/v1/licenses';

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
  if (rateBuckets.size > 10_000) rateBuckets.clear();
  return bucket.count > 10;
}

function json(data, { status = 200, demo = false } = {}) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (demo) headers['x-license-mode'] = 'demo';
  return new Response(JSON.stringify(data), { status, headers });
}

function licenseEnvReady(env) {
  return Boolean(env.LEMONSQUEEZY_API_KEY && env.LEMONSQUEEZY_STORE_ID && env.LEMONSQUEEZY_PRODUCT_ID);
}

async function lsCall(env, path, body) {
  const res = await fetch(`${LS_API}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LEMONSQUEEZY_API_KEY}`,
      accept: 'application/vnd.api+json',
      'content-type': 'application/vnd.api+json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
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
  if (!key) return json({ error: 'missing_key' }, { status: 400 });

  const demo = !licenseEnvReady(env);
  if (demo) {
    // DEMO 模式：固定キーのみ受理、挙動は本番と同一
    if (key !== DEMO_KEY) {
      return json({ valid: false, error: 'invalid_key' }, { status: 200, demo: true });
    }
    if (action === 'activate') {
      return json({ valid: true, instance_id: 'demo-instance-1' }, { demo: true });
    }
    if (action === 'validate') {
      return json({ valid: true, instance_id: payload.instance_id ?? 'demo-instance-1' }, { demo: true });
    }
    return json({ deactivated: true }, { demo: true });
  }

  try {
    if (action === 'activate') {
      const data = await lsCall(env, '/activate', {
        license_key: key,
        instance_name: payload.instance_name ?? 'browser',
      });
      if (data.activated) {
        return json({
          valid: true,
          instance_id: data.instance?.id ?? null,
          expires: data.license_key?.expires_at ?? null,
        });
      }
      return json({ valid: false, error: data.error ?? 'invalid_key' });
    }
    if (action === 'validate') {
      const data = await lsCall(env, '/validate', {
        license_key: key,
        instance_id: payload.instance_id ?? null,
      });
      return json({
        valid: Boolean(data.valid),
        instance_id: data.instance?.id ?? payload.instance_id ?? null,
        expires: data.license_key?.expires_at ?? null,
      });
    }
    // deactivate
    const data = await lsCall(env, '/deactivate', {
      license_key: key,
      instance_id: payload.instance_id ?? null,
    });
    return json({ deactivated: Boolean(data.deactivated) });
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
    const licenseMatch = /^\/api\/license\/(activate|validate|deactivate)$/.exec(path);
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
