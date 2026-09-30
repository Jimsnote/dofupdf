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
  Fingerprint,
  Receipt,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';

export type ToolStatus = 'live' | 'coming-soon';

/**
 * Coarse purpose groups used by the /tools/ directory. Six buckets keep the
 * navigation scannable while still separating the Japan-specific bookkeeping
 * tools (receipt sheet, e-invoice rename, pre-submit check) from the classics.
 */
export type ToolCategory =
  | 'organize'
  | 'convert'
  | 'stamp'
  | 'security'
  | 'business'
  | 'other';

export interface Tool {
  slug: string;
  icon: LucideIcon;
  i18nKey: keyof Dictionary['tools'];
  status: ToolStatus;
  category: ToolCategory;
}

/** Category display order for the /tools/ directory and any grouped listing. */
export const toolCategories: ToolCategory[] = [
  'organize',
  'convert',
  'stamp',
  'security',
  'business',
  'other',
];

/**
 * Central tool registry. Cards on the home page render from this list;
 * flipping a status to 'live' makes the card clickable once the tool route
 * exists.
 *
 * The order is the home page matrix (3 columns on desktop), so the first six
 * entries are what a visitor sees before scrolling — the receipt sheet sits at
 * the head of the second row because bookkeeping is the sharpest use case of
 * the whole set. The `category` field drives the /tools/ directory; the home
 * matrix order is independent of it.
 */
export const tools: Tool[] = [
  { slug: 'merge-pdf', icon: Merge, i18nKey: 'merge-pdf', status: 'live', category: 'organize' },
  { slug: 'split-pdf', icon: Scissors, i18nKey: 'split-pdf', status: 'live', category: 'organize' },
  { slug: 'compress-pdf', icon: Minimize2, i18nKey: 'compress-pdf', status: 'live', category: 'business' },
  { slug: 'receipt-sheet', icon: Printer, i18nKey: 'receipt-sheet', status: 'live', category: 'business' },
  { slug: 'rotate-pdf', icon: RotateCw, i18nKey: 'rotate-pdf', status: 'live', category: 'organize' },
  { slug: 'organize-pdf', icon: LayoutGrid, i18nKey: 'organize-pdf', status: 'live', category: 'organize' },
  { slug: 'remove-pages', icon: FileMinus, i18nKey: 'remove-pages', status: 'live', category: 'organize' },
  { slug: 'extract-pages', icon: FileOutput, i18nKey: 'extract-pages', status: 'live', category: 'organize' },
  { slug: 'reorder-pages', icon: ArrowUpDown, i18nKey: 'reorder-pages', status: 'live', category: 'organize' },
  { slug: 'docx-to-markdown', icon: FileType, i18nKey: 'docx-to-markdown', status: 'live', category: 'convert' },
  { slug: 'xlsx-to-markdown', icon: FileSpreadsheet, i18nKey: 'xlsx-to-markdown', status: 'live', category: 'convert' },
  { slug: 'extract-images', icon: Images, i18nKey: 'extract-images', status: 'live', category: 'convert' },
  { slug: 'pdf-to-jpg', icon: Image, i18nKey: 'pdf-to-jpg', status: 'live', category: 'convert' },
  { slug: 'jpg-to-pdf', icon: FileImage, i18nKey: 'jpg-to-pdf', status: 'live', category: 'convert' },
  { slug: 'heic-to-pdf', icon: ImagePlus, i18nKey: 'heic-to-pdf', status: 'live', category: 'convert' },
  { slug: 'sign-pdf', icon: Signature, i18nKey: 'sign-pdf', status: 'live', category: 'stamp' },
  { slug: 'hanko-pdf', icon: Fingerprint, i18nKey: 'hanko-pdf', status: 'live', category: 'stamp' },
  { slug: 'invoice-rename', icon: Receipt, i18nKey: 'invoice-rename', status: 'live', category: 'business' },
  { slug: 'pdf-check', icon: ShieldCheck, i18nKey: 'pdf-check', status: 'live', category: 'business' },
  { slug: 'protect-pdf', icon: Lock, i18nKey: 'protect-pdf', status: 'live', category: 'security' },
  { slug: 'unlock-pdf', icon: LockOpen, i18nKey: 'unlock-pdf', status: 'live', category: 'security' },
  { slug: 'watermark-pdf', icon: Stamp, i18nKey: 'watermark-pdf', status: 'live', category: 'stamp' },
  { slug: 'page-numbers', icon: Hash, i18nKey: 'page-numbers', status: 'live', category: 'organize' },
  { slug: 'pdf-to-markdown', icon: FileText, i18nKey: 'pdf-to-markdown', status: 'live', category: 'convert' },
  { slug: 'qr-code', icon: QrCode, i18nKey: 'qr-code', status: 'live', category: 'other' },
  { slug: 'ocr-pdf', icon: ScanText, i18nKey: 'ocr-pdf', status: 'live', category: 'convert' },
];

/** Live tools, derived from the central registry. */
export const liveTools = tools.filter((tool) => tool.status === 'live');

/**
 * Live tools grouped by category, in `toolCategories` order, preserving the
 * registry order within each group. Empty groups are dropped.
 */
export function toolGroups(): { category: ToolCategory; tools: Tool[] }[] {
  return toolCategories
    .map((category) => ({
      category,
      tools: liveTools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0);
}

/**
 * Localized names of the live tools, used for the home page's JSON-LD
 * featureList so the structured data matches the locale of the page.
 */
export function toolNames(dict: Dictionary): string[] {
  return liveTools.map((tool) => dict.tools[tool.i18nKey].name);
}
