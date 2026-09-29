import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { UnlockPdfTool } from '@/components/tools/UnlockPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface UnlockPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function UnlockPdfPage({ locale, dict }: UnlockPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="unlock-pdf">
      <UnlockPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
