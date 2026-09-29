'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js so visited pages and static assets work offline (PWA).
 * Production only — in dev the cache would fight hot reload. Failures are
 * swallowed: the site works identically without the service worker.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
