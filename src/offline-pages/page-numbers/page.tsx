import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { PageNumbersPage } from '@/components/pages/tools/PageNumbersPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/page-numbers',
    dict.toolPages['page-numbers'].metaTitle,
    dict.toolPages['page-numbers'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <PageNumbersPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
