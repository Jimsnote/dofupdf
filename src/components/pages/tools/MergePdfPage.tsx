import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { MergePdfTool } from '@/components/tools/MergePdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface MergePdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function MergePdfPage({ locale, dict }: MergePdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="merge-pdf">
      <MergePdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
