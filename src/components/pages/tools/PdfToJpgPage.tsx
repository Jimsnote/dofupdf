import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { PdfToJpgTool } from '@/components/tools/PdfToJpgTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface PdfToJpgPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function PdfToJpgPage({ locale, dict }: PdfToJpgPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="pdf-to-jpg">
      <PdfToJpgTool dict={dict} />
    </ToolPageScaffold>
  );
}
