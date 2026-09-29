import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { OrganizePdfTool } from '@/components/tools/OrganizePdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface ExtractPagesPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function ExtractPagesPage({ locale, dict }: ExtractPagesPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="extract-pages">
      <OrganizePdfTool dict={dict} preset="extract" />
    </ToolPageScaffold>
  );
}
