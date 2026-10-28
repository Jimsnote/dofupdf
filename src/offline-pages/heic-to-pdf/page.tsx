import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { HeicToPdfPage } from '@/components/pages/tools/HeicToPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/heic-to-pdf',
    dict.toolPages['heic-to-pdf'].metaTitle,
    dict.toolPages['heic-to-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <HeicToPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
