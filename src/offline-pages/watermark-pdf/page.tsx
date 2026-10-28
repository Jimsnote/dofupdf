import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { WatermarkPdfPage } from '@/components/pages/tools/WatermarkPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/watermark-pdf',
    dict.toolPages['watermark-pdf'].metaTitle,
    dict.toolPages['watermark-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <WatermarkPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
