import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { PdfPasswordHubPage } from '@/components/pages/PdfPasswordHubPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/pdf-password',
    dict.pdfPasswordHub.metaTitle,
    dict.pdfPasswordHub.metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <PdfPasswordHubPage dict={dict} />
    </SiteShell>
  );
}
