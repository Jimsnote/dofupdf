import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/site';
import { AnalyticsScript } from '@/components/layout/AnalyticsScript';
import { NotFoundContent } from '@/components/layout/NotFoundContent';
import './globals.css';

export const metadata: Metadata = {
  title: `ページが見つかりません | ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

/**
 * App-wide 404 document for URLs matching no route at all (enabled via
 * `experimental.globalNotFound`). The site is Japanese-only, so the 404
 * document is Japanese too.
 */
export default function GlobalNotFound() {
  return (
    <html lang="ja">
      <body>
        <NotFoundContent />
        <AnalyticsScript />
      </body>
    </html>
  );
}
