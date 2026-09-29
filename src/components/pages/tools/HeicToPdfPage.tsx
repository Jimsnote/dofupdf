import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { HeicToPdfTool } from '@/components/tools/HeicToPdfTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface HeicToPdfPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function HeicToPdfPage({ locale, dict }: HeicToPdfPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="heic-to-pdf">
      <HeicToPdfTool dict={dict} />
    </ToolPageScaffold>
  );
}
