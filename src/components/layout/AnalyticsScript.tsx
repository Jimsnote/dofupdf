import Script from 'next/script';
import { CF_ANALYTICS_TOKEN } from '@/lib/site';

/**
 * Analytics beacon, shared by both root layouts.
 * - Cloudflare Web Analytics: cookieless aggregate stats; renders only when
 *   NEXT_PUBLIC_CF_ANALYTICS_TOKEN is set.
 * No session-recording tools (Microsoft Clarity was removed): the privacy
 * promise is no uploads and no behavioral tracking beyond cookieless
 * aggregate stats. File bytes never touch the network by design (CSP:
 * connect-src), so analytics only ever sees page views.
 */
export function AnalyticsScript() {
  if (!CF_ANALYTICS_TOKEN) return null;
  return (
    <Script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: CF_ANALYTICS_TOKEN })}
      strategy="afterInteractive"
    />
  );
}
