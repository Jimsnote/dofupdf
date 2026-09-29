import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { ProtectPdfTool } from '@/components/tools/ProtectPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface ProtectPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function ProtectPdfPage({ locale, dict }: ProtectPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="protect-pdf">
      <ProtectPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
