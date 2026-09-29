import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { OcrPdfPage } from '@/components/pages/tools/OcrPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/ocr-pdf',
    dict.toolPages['ocr-pdf'].metaTitle,
    dict.toolPages['ocr-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <OcrPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
