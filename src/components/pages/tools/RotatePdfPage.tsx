import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { RotatePdfTool } from '@/components/tools/RotatePdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface RotatePdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function RotatePdfPage({ locale, dict }: RotatePdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="rotate-pdf">
      <RotatePdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
