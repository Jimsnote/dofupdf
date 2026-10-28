import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { TokushohoPage } from '@/components/pages/TokushohoPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(locale, '/tokushoho', dict.tokushoho.metaTitle, dict.tokushoho.metaDescription);
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <TokushohoPage dict={dict} />
    </SiteShell>
  );
}
