import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { OrganizePdfTool } from '@/components/tools/OrganizePdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface RemovePagesPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function RemovePagesPage({ locale, dict }: RemovePagesPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="remove-pages">
      <OrganizePdfTool dict={dict} preset="remove" />
    </ToolPageScaffold>
  );
}
