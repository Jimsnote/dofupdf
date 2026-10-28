import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { ReceiptSheetPage } from '@/components/pages/tools/ReceiptSheetPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  return pageMetadata(
    locale,
    '/receipt-sheet',
    dict.toolPages['receipt-sheet'].metaTitle,
    dict.toolPages['receipt-sheet'].metaDescription,
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <ReceiptSheetPage locale={locale} dict={dict} />
    </SiteShell>
  );
}
