import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { HankoPdfPage } from '@/components/pages/tools/HankoPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/hanko-pdf',
    dict.toolPages['hanko-pdf'].metaTitle,
    dict.toolPages['hanko-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <HankoPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
