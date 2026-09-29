import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { ReceiptSheetTool } from '@/components/tools/ReceiptSheetTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface ReceiptSheetPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function ReceiptSheetPage({ locale, dict }: ReceiptSheetPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="receipt-sheet">
      <ReceiptSheetTool dict={dict} />
    </ToolPageScaffold>
  );
}
