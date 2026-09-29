import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { SignPdfTool } from '@/components/tools/SignPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface SignPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function SignPdfPage({ locale, dict }: SignPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="sign-pdf">
      <SignPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
