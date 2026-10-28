import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { PdfToJpgPage } from '@/components/pages/tools/PdfToJpgPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/pdf-to-jpg',
    dict.toolPages['pdf-to-jpg'].metaTitle,
    dict.toolPages['pdf-to-jpg'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <PdfToJpgPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
