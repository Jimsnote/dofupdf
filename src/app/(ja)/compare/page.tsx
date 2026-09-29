import type { Metadata } from 'next';
import { getDictionary } from '@/i18n/get-dictionary';
import { pageMetadata } from '@/lib/seo';
import { SiteShell } from '@/components/layout/SiteShell';
import { CompareIndexPage } from '@/components/pages/compare/CompareIndexPage';

const locale = 'ja' as const;

export function generateMetadata(): Metadata {
  const dict = getDictionary(locale);
  void dict;
  return pageMetadata(
    locale,
    '/compare',
    'DofuPDF vs iLovePDF、Smallpdf、Sejda — 正直な比較 | DofuPDF',
    'ファクトチェック済みの比較：100%ローカル処理、永久無料、無制限のDofuPDFがiLovePDF、Smallpdf、Sejdaとどう違うか — 相手の本当に優れた点まで含めます。',
  );
}

export default function Page() {
  const dict = getDictionary(locale);
  return (
    <SiteShell locale={locale} dict={dict}>
      <CompareIndexPage />
    </SiteShell>
  );
}
