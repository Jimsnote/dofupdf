import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ExtractImagesPage } from '@/components/pages/tools/ExtractImagesPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/extract-images',
    dict.toolPages['extract-images'].metaTitle,
    dict.toolPages['extract-images'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ExtractImagesPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
