import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { UnlockPdfTool } from '@/components/tools/UnlockPdfTool';
import { BatchPdfTool } from '@/components/tools/BatchPdfTool';
import { ToolModeSwitch } from '@/components/tools/ToolModeSwitch';
import { ToolPageScaffold } from './ToolPageScaffold';

interface UnlockPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function UnlockPdfPage({ locale, dict }: UnlockPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="unlock-pdf">
      <ToolModeSwitch
        dict={dict}
        single={<UnlockPdfTool dict={dict} />}
        batch={<BatchPdfTool dict={dict} mode="unlock" />}
      />
    </ToolPageScaffold>
  );
}
