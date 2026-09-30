import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { PdfCheckTool } from '@/components/tools/PdfCheckTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface PdfCheckPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function PdfCheckPage({ locale, dict }: PdfCheckPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="pdf-check">
      <PdfCheckTool dict={dict} />
    </ToolPageScaffold>
  );
}
