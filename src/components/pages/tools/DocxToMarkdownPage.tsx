import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { DocxToMarkdownTool } from '@/components/tools/DocxToMarkdownTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface DocxToMarkdownPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function DocxToMarkdownPage({ locale, dict }: DocxToMarkdownPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="docx-to-markdown">
      <DocxToMarkdownTool dict={dict} />
    </ToolPageScaffold>
  );
}
