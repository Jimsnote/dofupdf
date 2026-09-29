import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { CompressPdfPage } from '@/components/pages/tools/CompressPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/compress-pdf',
    dict.toolPages['compress-pdf'].metaTitle,
    dict.toolPages['compress-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <CompressPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
