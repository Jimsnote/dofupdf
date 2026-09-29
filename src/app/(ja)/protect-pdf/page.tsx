import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ProtectPdfPage } from '@/components/pages/tools/ProtectPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/protect-pdf',
    dict.toolPages['protect-pdf'].metaTitle,
    dict.toolPages['protect-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ProtectPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
