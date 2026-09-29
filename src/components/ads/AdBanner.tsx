'use client';

import { useEffect } from 'react';
import { ADSENSE_CLIENT } from '@/lib/site';

interface AdBannerProps {
  /** AdSense slot id, required once ads go live. */
  slot?: string;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Google AdSense unit. Renders nothing unless NEXT_PUBLIC_ADSENSE_CLIENT is
 * configured. When it is, mounting the component injects adsbygoogle.js
 * (once, cross-origin anonymous) and pushes this unit. Not placed on any
 * page yet — import it where an ad unit should appear once advertising is
 * enabled.
 */
export function AdBanner({ slot, className }: AdBannerProps) {
  useEffect(() => {
    if (!ADSENSE_CLIENT) return;
    const existing = document.querySelector(
      'script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]',
    );
    if (!existing) {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
      document.head.appendChild(script);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Ad blockers break the push; nothing to do.
    }
  }, []);

  if (!ADSENSE_CLIENT) return null;

  return (
    <div className={className} aria-hidden={false}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
