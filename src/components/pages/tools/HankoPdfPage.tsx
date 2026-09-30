import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { HankoPdfTool } from '@/components/tools/HankoPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface HankoPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function HankoPdfPage({ locale, dict }: HankoPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="hanko-pdf">
      <HankoPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
