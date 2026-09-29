import { PdfToolError } from './errors';
import { parsePageRanges } from './page-ranges';
import { loadPdfJsDocument } from './pdfjs';

/** One extracted text line plus the metadata the Markdown heuristics need. */
export interface SourceLine {
  text: string;
  /** Largest font size on the line, in PDF points. */
  size: number;
  /** Baseline y position (PDF coordinates — larger means higher up). */
  y: number;
  /** 0-based page the line came from. */
  page: number;
}

export interface PdfToMarkdownOptions {
  /** Page-range expression like "1-3, 5"; every page when omitted. */
  range?: string;
}

/**
 * Extracts the text of a PDF as Markdown. Headings are inferred from the
 * font-size distribution, paragraphs from vertical spacing, and list lines
 * (•, -, 1.) are kept on their own lines. Short text repeated at the same
 * position on most pages is treated as headers/footers and dropped. Images
 * are not extracted.
 *
 * Throws `PdfToolError('no-text')` for scanned documents without a text
 * layer.
 */
export async function pdfToMarkdown(
  bytes: Uint8Array,
  options: PdfToMarkdownOptions = {},
): Promise<string> {
  const { doc, numPages, destroy } = await loadPdfJsDocument(bytes);
  try {
    const indices = options.range
      ? parsePageRanges(options.range, numPages)
      : Array.from({ length: numPages }, (_, i) => i);
    const pages: SourceLine[][] = [];
    for (const index of indices) {
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(index + 1);
      // eslint-disable-next-line no-await-in-loop
      const content = await page.getTextContent();
      pages.push(itemsToLines(content.items, index));
    }
    const markdown = pagesToMarkdown(pages);
    if (!markdown.trim()) {
      throw new PdfToolError('no-text', 'The PDF has no extractable text');
    }
    return markdown;
  } finally {
    await destroy();
  }
}

interface RawItem {
  str: string;
  x: number;
  y: number;
  size: number;
  width: number;
}

/**
 * Groups a page's text items into visual lines: items whose baseline y is
 * within a small tolerance belong to the same line, ordered left to right.
 */
function itemsToLines(items: unknown[], pageIndex: number): SourceLine[] {
  const raw: RawItem[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('str' in item)) continue;
    const textItem = item as { str: string; transform: number[]; width?: number };
    if (!textItem.str.trim()) continue;
    const t = textItem.transform;
    const size = Math.hypot(t[2] ?? 0, t[3] ?? 0) || Math.hypot(t[0] ?? 0, t[1] ?? 0) || 10;
    raw.push({ str: textItem.str, x: t[4] ?? 0, y: t[5] ?? 0, size, width: textItem.width ?? 0 });
  }
  raw.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: SourceLine[] = [];
  let current: RawItem[] = [];
  let currentY = 0;
  let currentSize = 0;
  const flush = () => {
    if (current.length > 0) lines.push(buildLine(current, currentY, pageIndex));
    current = [];
  };
  for (const item of raw) {
    const sameLine =
      current.length > 0 && Math.abs(item.y - currentY) <= Math.max(2, currentSize * 0.3);
    if (!sameLine) flush();
    if (current.length === 0) {
      currentY = item.y;
      currentSize = item.size;
    } else {
      currentSize = Math.max(currentSize, item.size);
    }
    current.push(item);
  }
  flush();
  return lines;
}

/**
 * Joins the items of one visual line, inserting a space only where the
 * horizontal gap looks like a word boundary (pdf.js often splits a line into
 * several items mid-word).
 */
function buildLine(items: RawItem[], y: number, pageIndex: number): SourceLine {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let text = '';
  let size = 0;
  let prev: RawItem | null = null;
  for (const item of sorted) {
    if (prev) {
      const gap = item.x - (prev.x + prev.width);
      if (gap > prev.size * 0.25 && gap < prev.size * 1.5 && !text.endsWith(' ')) {
        text += ' ';
      }
    }
    text += item.str;
    size = Math.max(size, item.size);
    prev = item;
  }
  return { text: text.replace(/\s+/g, ' ').trim(), y, size, page: pageIndex };
}

/** Heading thresholds, relative to the detected body font size. */
const HEADING_RATIOS: [number, number][] = [
  [1.6, 1],
  [1.35, 2],
  [1.15, 3],
];

function headingLevel(line: SourceLine, bodySize: number): number {
  if (line.text.length > 120) return 0;
  const ratio = line.size / bodySize;
  for (const [threshold, level] of HEADING_RATIOS) {
    if (ratio >= threshold) return level;
  }
  return 0;
}

const BULLET_RE = /^[•\-*–·▪◦]\s+/;
const ORDERED_RE = /^\d{1,3}[.)]\s+/;

/** Normalizes a list line, or returns null for non-list text. */
function asListItem(text: string): string | null {
  if (BULLET_RE.test(text)) return `- ${text.replace(BULLET_RE, '')}`;
  if (ORDERED_RE.test(text)) return text;
  return null;
}

/** The most common font size (rounded to 0.5pt) — assumed to be body text. */
function detectBodySize(lines: SourceLine[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const key = Math.round(line.size * 2) / 2;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 10;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size < best)) {
      best = size;
      bestCount = count;
    }
  }
  return best;
}

/** Short lines repeated at the same y position on most pages (headers/footers). */
function findRepeatedChrome(pages: SourceLine[][]): Set<SourceLine> {
  const chrome = new Set<SourceLine>();
  if (pages.length < 2) return chrome;
  const seenOnPages = new Map<string, Set<number>>();
  const keyOf = (line: SourceLine) => `${line.text} ${Math.round(line.y / 4)}`;
  for (const [pageIndex, lines] of pages.entries()) {
    for (const line of lines) {
      if (line.text.length > 80) continue;
      const key = keyOf(line);
      let set = seenOnPages.get(key);
      if (!set) {
        set = new Set();
        seenOnPages.set(key, set);
      }
      set.add(pageIndex);
    }
  }
  const threshold = Math.max(2, Math.ceil(pages.length * 0.6));
  for (const lines of pages) {
    for (const line of lines) {
      if ((seenOnPages.get(keyOf(line))?.size ?? 0) >= threshold) chrome.add(line);
    }
  }
  return chrome;
}

/**
 * Turns extracted lines into Markdown. A line much larger than the body font
 * becomes a heading; bullet/numbered lines stay on their own lines; a
 * vertical gap of more than ~1.6 line heights starts a new paragraph.
 */
export function pagesToMarkdown(pages: SourceLine[][]): string {
  const chrome = findRepeatedChrome(pages);
  const content = pages.flat().filter((line) => !chrome.has(line));
  if (content.length === 0) return '';

  const bodySize = detectBodySize(content);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let prev: SourceLine | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push(paragraph.join(' '));
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push(list.join('\n'));
    list = [];
  };

  for (const line of content) {
    const level = headingLevel(line, bodySize);
    const listItem = level === 0 ? asListItem(line.text) : null;
    if (level > 0) {
      flushParagraph();
      flushList();
      blocks.push(`${'#'.repeat(level)} ${line.text}`);
    } else if (listItem !== null) {
      flushParagraph();
      list.push(listItem);
    } else {
      flushList();
      const continues =
        paragraph.length > 0 &&
        prev !== null &&
        prev.page === line.page &&
        prev.y - line.y <= prev.size * 1.6;
      if (!continues) flushParagraph();
      paragraph.push(line.text);
    }
    prev = line;
  }
  flushParagraph();
  flushList();

  return `${blocks.join('\n\n')}\n`;
}
