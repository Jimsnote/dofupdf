import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { XlsxToMarkdownTool } from '@/components/tools/XlsxToMarkdownTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface XlsxToMarkdownPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function XlsxToMarkdownPage({ locale, dict }: XlsxToMarkdownPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="xlsx-to-markdown">
      <XlsxToMarkdownTool dict={dict} />
    </ToolPageScaffold>
  );
}
