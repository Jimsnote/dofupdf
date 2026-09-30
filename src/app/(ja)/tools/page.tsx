import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ToolsIndexPage } from '@/components/pages/ToolsIndexPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/tools',
    dict.toolsIndex.metaTitle,
    dict.toolsIndex.metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ToolsIndexPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
