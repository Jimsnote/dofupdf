import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { MergePdfPage } from '@/components/pages/tools/MergePdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/merge-pdf',
    dict.toolPages['merge-pdf'].metaTitle,
    dict.toolPages['merge-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <MergePdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
