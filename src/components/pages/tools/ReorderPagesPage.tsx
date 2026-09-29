import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { OrganizePdfTool } from '@/components/tools/OrganizePdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface ReorderPagesPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function ReorderPagesPage({ locale, dict }: ReorderPagesPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="reorder-pages">
      <OrganizePdfTool dict={dict} preset="reorder" />
    </ToolPageScaffold>
  );
}
