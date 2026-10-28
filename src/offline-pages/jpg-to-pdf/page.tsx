import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { JpgToPdfPage } from '@/components/pages/tools/JpgToPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/jpg-to-pdf',
    dict.toolPages['jpg-to-pdf'].metaTitle,
    dict.toolPages['jpg-to-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <JpgToPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
