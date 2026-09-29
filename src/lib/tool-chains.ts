import type { Dictionary } from '@/i18n/locales/ja';

type ToolKey = keyof Dictionary['tools'];

/**
 * 工具链推荐表：工具完成后推荐的下游工具（按任务流排序，最多 4 个）。
 * 参考 siritools.com 的 "next" 机制。只列出接受 PDF 输入的工具；
 * 输出非单 PDF 的工具（ZIP / Markdown / 图片）不参与发送侧。
 */
export const TOOL_CHAINS: Partial<Record<ToolKey, ToolKey[]>> = {
  'merge-pdf': ['compress-pdf', 'protect-pdf', 'page-numbers', 'split-pdf'],
  'split-pdf': ['merge-pdf', 'compress-pdf', 'rotate-pdf', 'protect-pdf'],
  'compress-pdf': ['protect-pdf', 'merge-pdf', 'watermark-pdf', 'page-numbers'],
  'rotate-pdf': ['compress-pdf', 'merge-pdf', 'page-numbers', 'protect-pdf'],
  'organize-pdf': ['compress-pdf', 'merge-pdf', 'protect-pdf', 'page-numbers'],
  'protect-pdf': ['compress-pdf', 'sign-pdf', 'merge-pdf', 'page-numbers'],
  'unlock-pdf': ['compress-pdf', 'organize-pdf', 'split-pdf', 'merge-pdf'],
  'watermark-pdf': ['compress-pdf', 'protect-pdf', 'page-numbers', 'merge-pdf'],
  'page-numbers': ['compress-pdf', 'protect-pdf', 'watermark-pdf', 'merge-pdf'],
  'sign-pdf': ['compress-pdf', 'protect-pdf', 'merge-pdf', 'page-numbers'],
  'jpg-to-pdf': ['compress-pdf', 'merge-pdf', 'rotate-pdf', 'protect-pdf'],
  'heic-to-pdf': ['compress-pdf', 'jpg-to-pdf', 'merge-pdf', 'protect-pdf'],
  'ocr-pdf': ['pdf-to-markdown', 'compress-pdf', 'protect-pdf', 'merge-pdf'],
};
