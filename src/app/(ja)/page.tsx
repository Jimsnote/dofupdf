import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { HomePage } from '@/components/pages/HomePage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(locale, '', dict.home.metaTitle, dict.home.metaDescription);
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <HomePage locale={locale} dict={dict} />
    </SiteShell>
  );
}
