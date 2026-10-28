import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { XlsxToMarkdownPage } from '@/components/pages/tools/XlsxToMarkdownPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/xlsx-to-markdown',
    dict.toolPages['xlsx-to-markdown'].metaTitle,
    dict.toolPages['xlsx-to-markdown'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <XlsxToMarkdownPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
