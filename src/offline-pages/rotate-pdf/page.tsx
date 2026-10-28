import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { RotatePdfPage } from '@/components/pages/tools/RotatePdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/rotate-pdf',
    dict.toolPages['rotate-pdf'].metaTitle,
    dict.toolPages['rotate-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <RotatePdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
