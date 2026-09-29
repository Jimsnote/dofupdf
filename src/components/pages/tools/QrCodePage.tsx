import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { QrCodeTool } from '@/components/tools/QrCodeTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface QrCodePageProps {
  locale: Locale;
  dict: Dictionary;
}

export function QrCodePage({ locale, dict }: QrCodePageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="qr-code">
      <QrCodeTool dict={dict} />
    </ToolPageScaffold>
  );
}
