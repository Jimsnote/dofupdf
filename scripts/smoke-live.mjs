#!/usr/bin/env node
/**
 * Live smoke test against a deployed dofupdf environment.
 *
 *   node scripts/smoke-live.mjs                     # https://dofupdf.com
 *   node scripts/smoke-live.mjs --base=http://localhost:4899
 *
 * Read-only: every check is a GET/HEAD of something public. Exit code 1 when a
 * check fails, so it can gate a deploy. Checks were written after a live audit
 * found a www -> apex redirect loop (Location without a scheme resolves
 * relative to the current path, so the browser stays on www forever) — that
 * regression is check #1 and must never come back.
 */

import { readdirSync } from 'node:fs';

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('--base=')) ?? '--base=https://dofupdf.com').slice(7).replace(/\/$/, '');
const host = new URL(base).host;

// The IndexNow key lives in public/ as <32 hex>.txt; reading it locally keeps the
// check honest without hardcoding a value that can rotate.
function localIndexNowKey() {
  try {
    return readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[0-9a-f]{32}\.txt$/.test(f)) ?? null;
  } catch {
    return null;
  }
}
const indexNowKey = localIndexNowKey();

const problems = [];
let passed = 0;
const record = (level, name, detail) => {
  if (level === 'PASS') passed += 1;
  else problems.push({ level, name, detail });
  console.log(`  ${level.padEnd(5)} ${name}${detail ? ` — ${detail}` : ''}`);
};
const check = (ok, name, detail, soft = false) => record(ok ? 'PASS' : soft ? 'INFO' : 'FAIL', name, detail);

/** Fetch without following redirects; never throws, returns status 0 on transport errors. */
async function req(pathOrUrl, opts = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : base + pathOrUrl;
  const method = opts.method ?? 'GET';
  // GET responses are read in full (the checks parse HTML/XML out of them);
  // HEAD carries headers only, so asking for a body there is pointless.
  const wantBody = opts.body ?? method !== 'HEAD';
  // One retry on a transport error: a dropped connection is a property of the
  // network this script runs on, not of the deployment, and a flaky gate is a
  // gate nobody trusts.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeout ?? 30000),
        headers: opts.headers ?? {},
      });
      const headers = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      const body = wantBody ? await res.text() : '';
      if (!wantBody) await res.body?.cancel().catch(() => {});
      return { url, status: res.status, headers, body };
    } catch (err) {
      if (attempt === 1) return { url, status: 0, headers: {}, body: '', error: String(err.cause?.message ?? err.message ?? err) };
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return { url, status: 0, headers: {}, body: '', error: 'unreachable' };
}

/** Follow a redirect chain by hand so a loop is reported instead of swallowed. */
async function trace(start, maxHops = 5) {
  let url = start;
  const hops = [];
  for (let i = 0; i < maxHops; i += 1) {
    const res = await req(url, { method: 'HEAD' });
    const loc = res.headers.location;
    hops.push(`${res.status}${loc ? ` -> ${JSON.stringify(loc)}` : ''}`);
    if (!loc) return { url, hops, terminal: true, status: res.status };
    const next = new URL(loc, url).toString();
    if (next === url) return { url, hops, loop: true };
    url = next;
  }
  return { url, hops, loop: true };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const at = i++;
        out[at] = await fn(items[at], at);
      }
    }),
  );
  return out;
}

console.log(`\nsmoke: ${base}\n`);

// ---------- 1. hostname / scheme hygiene ----------
console.log('1. host + scheme');
{
  const apex = await req('/', { method: 'HEAD' });
  check(apex.status === 200, 'apex serves 200', `${apex.status}`);

  const www = await trace(`https://www.${host}/`);
  check(
    !www.loop && www.terminal === true && www.status === 200 && new URL(www.url).host === host,
    'www reaches the apex without looping',
    `hops: ${www.hops.join(' | ')}${www.loop ? ' *** LOOP ***' : ''}`,
  );
  const wwwDeep = await trace(`https://www.${host}/merge-pdf/`);
  check(
    !wwwDeep.loop && wwwDeep.url.endsWith('/merge-pdf/'),
    'www keeps the path when redirecting',
    `${wwwDeep.url}${wwwDeep.loop ? ' *** LOOP ***' : ''}`,
  );

  const plain = await trace(`http://${host}/`);
  check(!plain.loop && plain.url.startsWith('https://'), 'http upgrades to https', plain.url);
}

// ---------- 2. security headers ----------
console.log('\n2. headers');
{
  const home = await req('/');
  const csp = home.headers['content-security-policy'] ?? '';
  check(csp.length > 0, 'CSP is served', csp ? `${csp.split(';').length} directives` : 'MISSING');
  check(/connect-src 'self'/.test(csp), "CSP keeps connect-src 'self' (the no-upload promise)", (csp.match(/connect-src[^;]*/) ?? ['-'])[0]);
  check(/frame-ancestors 'none'/.test(csp), 'CSP frames are refused');
  check(home.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff');
  check(!!home.headers['referrer-policy'], 'Referrer-Policy', home.headers['referrer-policy'] ?? '');
  check(!!home.headers['permissions-policy'], 'Permissions-Policy', home.headers['permissions-policy'] ?? '');
  check(!!home.headers['strict-transport-security'], 'HSTS is enabled', home.headers['strict-transport-security'] ?? 'MISSING (enable SSL/TLS -> Edge Certificates -> HSTS)');
  check(!/localhost|127\.0\.0\.1|noripdf|getcoolpdf|coolfax/i.test(home.body), 'HTML has no dev or legacy host strings');
  check(/<html[^>]*lang="ja"/.test(home.body), 'HTML lang is ja');
}

// ---------- 3. path handling ----------
console.log('\n3. paths');
{
  const noSlash = await req('/merge-pdf', { method: 'HEAD' });
  check(noSlash.status === 307 && noSlash.headers.location === '/merge-pdf/', 'extensionless folder path gets a trailing slash', `${noSlash.status} -> ${noSlash.headers.location}`);
  const notFound = await req('/this-page-does-not-exist/');
  check(notFound.status === 404 && notFound.body.length > 2000, 'unknown path returns a real 404 document', `status=${notFound.status} bytes=${notFound.body.length}`);
  for (const [from, to] of [['/de/merge-pdf/', '/merge-pdf/'], ['/ja/', '/'], ['/zh/merge-pdf/', '/merge-pdf/']]) {
    const r = await req(from, { method: 'HEAD' });
    check([301, 302, 307, 308].includes(r.status) && r.headers.location === to, `legacy locale ${from} redirects to ${to}`, `${r.status} -> ${r.headers.location}`);
  }
  for (const internal of ['/_headers', '/_redirects']) {
    const r = await req(internal, { method: 'HEAD' });
    check(r.status === 404, `${internal} is not publicly served`, `${r.status}`);
  }
}

// ---------- 4. cache policy ----------
console.log('\n4. caching');
{
  const html = await req('/').then((r) => r.body);
  const chunk = (html.match(/"(\/_next\/static\/chunks\/[^"]+\.js)"/) ?? [])[1];
  const css = (html.match(/"(\/_next\/static\/[^"]+\.css)"/) ?? [])[1];
  const fresh = '?smoke=' + Date.now();
  const probes = [
    ['hashed script is immutable for a year', chunk, /max-age=31536000/, false],
    ['stylesheet is immutable for a year', css, /max-age=31536000/, false],
    ['pdf engine wasm is cached for days', '/wasm/gs-0.0.2.wasm', /max-age=(2592000|31536000)/, false],
    ['service worker always revalidates', '/sw.js', /no-cache/, false],
    ['html always revalidates', '/', /max-age=0/, false],
  ];
  for (const [name, path, expect, soft] of probes) {
    if (!path) { record('INFO', name, 'not found on the page'); continue; }
    const r = await req(path + fresh, { method: 'HEAD' });
    const cc = r.headers['cache-control'] ?? '';
    check(r.status === 200 && expect.test(cc), name, `status=${r.status} cache-control=${cc || '(none)'}`, soft);
  }
}

// ---------- 5. engines + offline assets ----------
console.log('\n5. engines + assets');
{
  const manifest = await req('/wasm/manifest.json').then((r) => JSON.parse(r.body || '{}'));
  for (const [engine, file] of Object.entries(manifest)) {
    const r = await req(`/wasm/${file}`, { method: 'HEAD' });
    check(r.status === 200, `${engine} engine is downloadable`, `/wasm/${file} -> ${r.status} ${r.headers['content-type'] ?? ''}`);
  }
  for (const lang of ['eng', 'jpn']) {
    const r = await req(`/tesseract/${lang}.traineddata.gz`, { method: 'HEAD' });
    check(r.status === 200, `OCR language data ${lang} is downloadable`, `${r.status} ${r.headers['content-length'] ?? '?'} bytes`);
  }
  for (const asset of ['/tesseract/worker.min.js', '/manifest.webmanifest', '/og.png', '/logo.svg']) {
    const r = await req(asset, { method: 'HEAD' });
    check(r.status === 200, `${asset} is served`, `${r.status}`);
  }
  const mf = await req('/manifest.webmanifest').then((r) => JSON.parse(r.body || '{}')).catch(() => null);
  if (mf) {
    const icons = await mapLimit(mf.icons ?? [], 4, (i) => req(i.src, { method: 'HEAD' }));
    check(icons.every((i) => i.status === 200), 'every manifest icon resolves', icons.map((i) => `${i.status}`).join(','));
  }
}

// ---------- 6. crawl surface ----------
console.log('\n6. sitemap + robots');
{
  const robots = await req('/robots.txt');
  check(robots.status === 200 && robots.body.includes('Sitemap:'), 'robots.txt allows crawling and points at the sitemap');
  check(robots.body.includes(`${base}/sitemap.xml`), 'robots.txt sitemap URL matches this host', `${base}/sitemap.xml`);
  check((await req('/llms.txt', { method: 'HEAD' })).status === 200, 'llms.txt is served');
  const keyFile = indexNowKey ? `/${indexNowKey}` : null;
  if (keyFile) check((await req(keyFile, { method: 'HEAD' })).status === 200, 'IndexNow key file is served', keyFile);

  const sm = await req('/sitemap.xml');
  const urls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check(sm.status === 200 && urls.length > 0, 'sitemap.xml parses', `${urls.length} URLs`);
  const foreign = urls.filter((u) => !u.startsWith(base + '/'));
  check(foreign.length === 0, 'every sitemap URL belongs to this host', foreign.slice(0, 3).join(' '));
  const checked = await mapLimit(urls, 8, async (u) => ({ u, ...(await req(u, { method: 'HEAD' })) }));
  const broken = checked.filter((c) => c.status !== 200).map((c) => `${c.u} (${c.status}${c.error ? ' ' + c.error : ''})`);
  check(urls.length > 0 && broken.length === 0, 'every sitemap URL returns 200', broken.length ? broken.slice(0, 8).join(' | ') : `${urls.length}/${urls.length}`);
  check(/<lastmod>/.test(sm.body), 'sitemap carries <lastmod>', 'helps crawlers prioritise re-crawls', true);
}

// ---------- 7. canonical + og on a sample ----------
console.log('\n7. canonicals');
{
  const sample = ['/', '/receipt-sheet/', '/compress-pdf/', '/guides/', '/compare/'];
  for (const path of sample) {
    const r = await req(path);
    const canon = (r.body.match(/rel="canonical" href="([^"]+)"/) ?? [])[1] ?? '';
    check(r.status === 200 && canon.startsWith(`${base}/`), `canonical of ${path} points at this host`, canon || 'MISSING');
  }
}

// ---------- verdict ----------
const fails = problems.filter((p) => p.level === 'FAIL');
const warns = problems.filter((p) => p.level !== 'FAIL');
console.log(`\n=== ${passed} passed, ${fails.length} failed${warns.length ? `, ${warns.length} to consider` : ''} ===`);
for (const p of fails) console.log(`  FAIL ${p.name} — ${p.detail}`);
for (const p of warns) console.log(`  INFO ${p.name} — ${p.detail}`);
process.exit(fails.length ? 1 : 0);
