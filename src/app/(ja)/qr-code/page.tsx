import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { QrCodePage } from '@/components/pages/tools/QrCodePage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/qr-code',
    dict.toolPages['qr-code'].metaTitle,
    dict.toolPages['qr-code'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <QrCodePage locale={locale} dict={dict} />
    </SiteShell>
  );
}
