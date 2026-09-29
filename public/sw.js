/**
 * DofuPDF Service Worker — 离线可用的核心。
 *
 * 缓存策略：
 * - /_next/static/**（内容哈希、不可变）：cache-first
 * - 页面导航（HTML）：network-first，离线时回退缓存——访问过的页面离线可开
 * - 其他同源 GET（图标、manifest 等）：stale-while-revalidate
 * - /wasm/** 不归本 SW 管：PDF 引擎 wasm 由 pdf-heavy.worker.ts 通过自己的
 *   Cache Storage 管理（带进度预取），两者各管一摊，避免双份存储。
 * - 跨源请求（Clarity/CF Analytics 等）一律不拦截。
 *
 * 更新机制：本文件以 Cache-Control: no-cache 提供（见 public/_headers），
 * 内容变化时浏览器重新安装，VERSION 递增会清掉旧版本缓存。
 */

const VERSION = 'v1';
const STATIC_CACHE = `dofupdf-static-${VERSION}`;
const PAGES_CACHE = `dofupdf-pages-${VERSION}`;
const RUNTIME_CACHE = `dofupdf-runtime-${VERSION}`;
const ALL_CACHES = [STATIC_CACHE, PAGES_CACHE, RUNTIME_CACHE];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => (key.startsWith('noripdf-') || key.startsWith('coolpdf-')) && !ALL_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline and page not cached');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetched = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached ?? (await fetched) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 跨源（埋点等）不拦截
  if (url.pathname.startsWith('/wasm/')) return; // 引擎由 worker 的 Cache Storage 管

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
