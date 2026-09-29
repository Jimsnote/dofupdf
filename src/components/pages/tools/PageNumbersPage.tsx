import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { PageNumbersTool } from '@/components/tools/PageNumbersTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface PageNumbersPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function PageNumbersPage({ locale, dict }: PageNumbersPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="page-numbers">
      <PageNumbersTool dict={dict} />
    </ToolPageScaffold>
  );
}
