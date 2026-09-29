import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { UnlockPdfPage } from '@/components/pages/tools/UnlockPdfPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/unlock-pdf',
    dict.toolPages['unlock-pdf'].metaTitle,
    dict.toolPages['unlock-pdf'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <UnlockPdfPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
