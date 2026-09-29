import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { CompressPdfTool } from '@/components/tools/CompressPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface CompressPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function CompressPdfPage({ locale, dict }: CompressPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="compress-pdf">
      <CompressPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
