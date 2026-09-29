import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { SplitPdfTool } from '@/components/tools/SplitPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface SplitPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function SplitPdfPage({ locale, dict }: SplitPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="split-pdf">
      <SplitPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
