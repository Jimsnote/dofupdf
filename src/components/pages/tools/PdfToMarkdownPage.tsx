import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { PdfToMarkdownTool } from '@/components/tools/PdfToMarkdownTool';
import { ToolPageScaffold } from './ToolPageScaffold';

interface PdfToMarkdownPageProps {
  locale: Locale;
  dict: Dictionary;
}

export function PdfToMarkdownPage({ locale, dict }: PdfToMarkdownPageProps) {
  return (
    <ToolPageScaffold locale={locale} dict={dict} slug="pdf-to-markdown">
      <PdfToMarkdownTool dict={dict} />
    </ToolPageScaffold>
  );
}
