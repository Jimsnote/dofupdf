import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { SplitPdfPage } from '@/components/pages/tools/SplitPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/split-pdf',
    dict.toolPages['split-pdf'].metaTitle,
    dict.toolPages['split-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <SplitPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
