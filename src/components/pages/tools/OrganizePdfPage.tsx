import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { OrganizePdfTool } from '@/components/tools/OrganizePdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface OrganizePdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function OrganizePdfPage({ locale, dict }: OrganizePdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="organize-pdf">
      <OrganizePdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
