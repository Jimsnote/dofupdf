import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ReorderPagesPage } from '@/components/pages/tools/ReorderPagesPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/reorder-pages',
    dict.toolPages['reorder-pages'].metaTitle,
    dict.toolPages['reorder-pages'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ReorderPagesPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
