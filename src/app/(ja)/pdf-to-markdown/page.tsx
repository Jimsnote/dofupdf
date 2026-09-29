import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { PdfToMarkdownPage } from '@/components/pages/tools/PdfToMarkdownPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/pdf-to-markdown',
    dict.toolPages['pdf-to-markdown'].metaTitle,
    dict.toolPages['pdf-to-markdown'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <PdfToMarkdownPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
