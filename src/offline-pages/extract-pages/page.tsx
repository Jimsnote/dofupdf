import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ExtractPagesPage } from '@/components/pages/tools/ExtractPagesPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/extract-pages',
    dict.toolPages['extract-pages'].metaTitle,
    dict.toolPages['extract-pages'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ExtractPagesPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
