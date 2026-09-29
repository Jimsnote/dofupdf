import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { ExtractImagesTool } from '@/components/tools/ExtractImagesTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface ExtractImagesPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function ExtractImagesPage({ locale, dict }: ExtractImagesPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="extract-images">
      <ExtractImagesTool dict={dict} />
    </ToolPageScaffold>
  );
}
