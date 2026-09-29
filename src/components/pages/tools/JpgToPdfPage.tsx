import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { JpgToPdfTool } from '@/components/tools/JpgToPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface JpgToPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function JpgToPdfPage({ locale, dict }: JpgToPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="jpg-to-pdf">
      <JpgToPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
