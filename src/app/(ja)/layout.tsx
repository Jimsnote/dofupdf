import type { Metadata, Viewport } from 'next';
import { SITE_NAME } from '@/lib/site';
import { AnalyticsScript } from '@/components/layout/AnalyticsScript';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import '../globals.css';

const SITE_TAGLINE = 'プライバシーを守る無料PDFツール';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dofupdf.com',
  ),
  title: {
    default: `${SITE_TAGLINE} | ${SITE_NAME}`,
    template: `%s`,
  },
  description: SITE_TAGLINE,
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
};

/**
 * Root layout of the (ja) route group: every unprefixed, Japanese page.
 */
export default function JaRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
        <AnalyticsScript />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
