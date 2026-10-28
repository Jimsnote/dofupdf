import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { PdfCheckPage } from '@/components/pages/tools/PdfCheckPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/pdf-check',
    dict.toolPages['pdf-check'].metaTitle,
    dict.toolPages['pdf-check'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <PdfCheckPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
