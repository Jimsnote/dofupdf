import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { DocxToMarkdownPage } from '@/components/pages/tools/DocxToMarkdownPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/docx-to-markdown',
    dict.toolPages['docx-to-markdown'].metaTitle,
    dict.toolPages['docx-to-markdown'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <DocxToMarkdownPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
