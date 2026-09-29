import {
  ArrowUpDown,
  FileImage,
  FileMinus,
  FileOutput,
  FileSpreadsheet,
  FileText,
  FileType,
  Hash,
  Images,
  Lock,
  LockOpen,
  Merge,
  Minimize2,
  Printer,
  RotateCw,
  Scissors,
  Stamp,
  Signature,
  LayoutGrid,
  Image,
  ImagePlus,
  QrCode,
  ScanText,
  type LucideIcon,
} from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';

export type ToolStatus = 'live' | 'coming-soon';

export interface Tool {
  slug: string;
  icon: LucideIcon;
  i18nKey: keyof Dictionary['tools'];
  status: ToolStatus;
}

/**
 * Central tool registry. Cards on the home page render from this list;
 * flipping a status to 'live' makes the card clickable once the tool route
 * exists.
 *
 * The order is the home page matrix (3 columns on desktop), so the first six
 * entries are what a visitor sees before scrolling — the receipt sheet sits at
 * the head of the second row because bookkeeping is the sharpest use case of
 * the whole set.
 */
export const tools: Tool[] = [
  { slug: 'merge-pdf', icon: Merge, i18nKey: 'merge-pdf', status: 'live' },
  { slug: 'split-pdf', icon: Scissors, i18nKey: 'split-pdf', status: 'live' },
  { slug: 'compress-pdf', icon: Minimize2, i18nKey: 'compress-pdf', status: 'live' },
  { slug: 'receipt-sheet', icon: Printer, i18nKey: 'receipt-sheet', status: 'live' },
  { slug: 'rotate-pdf', icon: RotateCw, i18nKey: 'rotate-pdf', status: 'live' },
  { slug: 'organize-pdf', icon: LayoutGrid, i18nKey: 'organize-pdf', status: 'live' },
  { slug: 'remove-pages', icon: FileMinus, i18nKey: 'remove-pages', status: 'live' },
  { slug: 'extract-pages', icon: FileOutput, i18nKey: 'extract-pages', status: 'live' },
  { slug: 'reorder-pages', icon: ArrowUpDown, i18nKey: 'reorder-pages', status: 'live' },
  { slug: 'docx-to-markdown', icon: FileType, i18nKey: 'docx-to-markdown', status: 'live' },
  { slug: 'xlsx-to-markdown', icon: FileSpreadsheet, i18nKey: 'xlsx-to-markdown', status: 'live' },
  { slug: 'extract-images', icon: Images, i18nKey: 'extract-images', status: 'live' },
  { slug: 'pdf-to-jpg', icon: Image, i18nKey: 'pdf-to-jpg', status: 'live' },
  { slug: 'jpg-to-pdf', icon: FileImage, i18nKey: 'jpg-to-pdf', status: 'live' },
  { slug: 'heic-to-pdf', icon: ImagePlus, i18nKey: 'heic-to-pdf', status: 'live' },
  { slug: 'sign-pdf', icon: Signature, i18nKey: 'sign-pdf', status: 'live' },
  { slug: 'protect-pdf', icon: Lock, i18nKey: 'protect-pdf', status: 'live' },
  { slug: 'unlock-pdf', icon: LockOpen, i18nKey: 'unlock-pdf', status: 'live' },
  { slug: 'watermark-pdf', icon: Stamp, i18nKey: 'watermark-pdf', status: 'live' },
  { slug: 'page-numbers', icon: Hash, i18nKey: 'page-numbers', status: 'live' },
  { slug: 'pdf-to-markdown', icon: FileText, i18nKey: 'pdf-to-markdown', status: 'live' },
  { slug: 'qr-code', icon: QrCode, i18nKey: 'qr-code', status: 'live' },
  { slug: 'ocr-pdf', icon: ScanText, i18nKey: 'ocr-pdf', status: 'live' },
];

/** Live tools, derived from the central registry. */
export const liveTools = tools.filter((tool) => tool.status === 'live');

/**
 * Localized names of the live tools, used for the home page's JSON-LD
 * featureList so the structured data matches the locale of the page.
 */
export function toolNames(dict: Dictionary): string[] {
  return liveTools.map((tool) => dict.tools[tool.i18nKey].name);
}
