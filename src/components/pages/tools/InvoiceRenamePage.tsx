import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { InvoiceRenameTool } from '@/components/tools/InvoiceRenameTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface InvoiceRenamePageProps {
  locale: Locale;
  dict: Dictionary;
}

export function InvoiceRenamePage({ locale, dict }: InvoiceRenamePageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="invoice-rename">
      <InvoiceRenameTool dict={dict} />
    </ToolPageScaffold>
  );
}
