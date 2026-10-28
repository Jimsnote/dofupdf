import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { ProtectPdfTool } from '@/components/tools/ProtectPdfTool';
import { BatchPdfTool } from '@/components/tools/BatchPdfTool';
import { ToolModeSwitch } from '@/components/tools/ToolModeSwitch';
import { ToolPageScaffold } from './ToolPageScaffold';

interface ProtectPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function ProtectPdfPage({ locale, dict }: ProtectPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="protect-pdf">
      <ToolModeSwitch
        dict={dict}
        single={<ProtectPdfTool dict={dict} />}
        batch={<BatchPdfTool dict={dict} mode="protect" />}
      />
    </ToolPageScaffold>
  );
}
