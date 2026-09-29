import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { OcrPdfTool } from '@/components/tools/OcrPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface OcrPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function OcrPdfPage({ locale, dict }: OcrPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="ocr-pdf">
      <OcrPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
