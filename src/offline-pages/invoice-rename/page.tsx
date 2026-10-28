import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { InvoiceRenamePage } from '@/components/pages/tools/InvoiceRenamePage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/invoice-rename',
    dict.toolPages['invoice-rename'].metaTitle,
    dict.toolPages['invoice-rename'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <InvoiceRenamePage locale={locale} dict={dict} />
    </SiteShell>
  );
}
