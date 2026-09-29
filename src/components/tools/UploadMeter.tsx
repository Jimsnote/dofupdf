'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { formatBytes } from './DownloadCard';

/**
 * "File data uploaded this session" 实时计数器（信任装置，非装饰）。
 *
 * 拦截 fetch / XMLHttpRequest / sendBeacon，统计请求体字节数并实时显示。
 * 由于所有文件处理都在浏览器内完成（CSP connect-src 'self' blob: 强制），
 * 这个计数器应该永远是 0 B——它把"零上传"从口号变成用户可验证的证据。
 *
 * 分析埋点域名被排除在统计之外：它们只携带页面浏览数据，不携带文件内容，
 * 而本计数器度量的是"文件数据外发"。（Clarity 已移除；cloudflareinsights
 * 为 CF 无 Cookie 汇总统计。保留 clarity.ms 是防御性的——万一将来重新启用。）
 */

const ANALYTICS_HOSTS = ['clarity.ms', 'cloudflareinsights.com'];
const PATCHED = Symbol.for('dofupdf.uploadMeter.patched');

let totalBytes = 0;
const listeners = new Set<(bytes: number) => void>();

/** 估算请求体字节数（纯函数，Node 可测）。ReadableStream 等无法测量的按 0 计。 */
export function bodySize(body: unknown): number {
  if (body === null || body === undefined) return 0;
  if (typeof body === 'string') return new TextEncoder().encode(body).length;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return new TextEncoder().encode(body.toString()).length;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    let total = 0;
    body.forEach((value) => {
      total += typeof value === 'string' ? new TextEncoder().encode(value).length : value.size;
    });
    return total;
  }
  return 0;
}

function isAnalyticsUrl(url: string): boolean {
  try {
    const host = new URL(url, window.location.href).hostname;
    return ANALYTICS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function report(url: string, body: unknown) {
  if (isAnalyticsUrl(url)) return;
  const size = bodySize(body);
  if (size <= 0) return;
  totalBytes += size;
  listeners.forEach((listener) => listener(totalBytes));
}

function patchOnce() {
  const w = window as unknown as Record<symbol, boolean>;
  if (w[PATCHED]) return;
  w[PATCHED] = true;

  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    try {
      const url =
        typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      report(url, init?.body ?? null);
    } catch {
      // 测量失败不能影响正常请求
    }
    return originalFetch.call(this, input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function patchedOpen(
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ) {
    (this as unknown as { __dofupdfUrl?: string }).__dofupdfUrl = String(url);
    return originalOpen.call(this, method, url, async, username, password);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      report((this as unknown as { __dofupdfUrl?: string }).__dofupdfUrl ?? '', body ?? null);
    } catch {
      // 同上
    }
    return originalSend.call(this, body);
  };

  if (typeof navigator.sendBeacon === 'function') {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function patchedBeacon(url: string | URL, data?: BodyInit | null) {
      try {
        report(String(url), data ?? null);
      } catch {
        // 同上
      }
      return originalBeacon(url, data);
    };
  }
}

/**
 * Renders the live "file data uploaded" counter. Mounts once per tool page
 * (inside FileDropzone); the network patch is applied at most once globally.
 */
export function UploadMeter({ label }: { label: string }) {
  const [bytes, setBytes] = useState(totalBytes);

  useEffect(() => {
    patchOnce();
    const listener = (value: number) => setBytes(value);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />
      {label.replace('{size}', formatBytes(bytes))}
    </p>
  );
}
