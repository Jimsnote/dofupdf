import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { RemovePagesPage } from '@/components/pages/tools/RemovePagesPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/remove-pages',
    dict.toolPages['remove-pages'].metaTitle,
    dict.toolPages['remove-pages'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <RemovePagesPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
