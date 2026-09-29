import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { WatermarkPdfTool } from '@/components/tools/WatermarkPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface WatermarkPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function WatermarkPdfPage({ locale, dict }: WatermarkPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="watermark-pdf">
      <WatermarkPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
