import { PdfToolError } from './errors';
import { escapeMarkdownText } from '../markdown-safety';
import { parsePageRanges } from './page-ranges';
import { loadPdfJsDocument } from './pdfjs';

/** One extracted text line plus the metadata the Markdown heuristics need. */
export interface SourceLine {
  text: string;
  /** Largest font size on the line, in PDF points. */
  size: number;
  /** Baseline y position (PDF coordinates — larger means higher up). */
  y: number;
  /** Left edge / right edge of the line (column detection). */
  x: number;
  xEnd: number;
  /** 0-based page the line came from. */
  page: number;
  /** Column gutter x when the line was split off a wider visual line. */
  splitAt?: number;
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
 * within a small tolerance belong to the same line. A large horizontal gap
 * inside a line means a column break — the line is split there so columns
 * never interleave mid-sentence, and when the split points share a stable
 * gutter the page is reordered column-by-column.
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
    if (current.length > 0) {
      for (const segment of splitAtColumnGaps(current)) {
        lines.push(buildLine(segment, currentY, pageIndex));
      }
    }
    current = [];
  };  for (const item of raw) {
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
  return orderColumns(lines);
}

interface Segment {
  items: RawItem[];
  /** 分割が起きた場合の溝位置（段の境界 x 中点）。 */
  splitAt?: number;
}

/**
 * Splits one visual line at column-sized horizontal gaps (over ~4 font
 * heights). Every segment of a split line carries the gutter position so the
 * page-level column detector can find a stable split line.
 */
function splitAtColumnGaps(items: RawItem[]): Segment[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const groups: Segment[] = [];
  let cur: RawItem[] = [];
  let lastBoundary: number | undefined;
  for (const item of sorted) {
    const prev = cur[cur.length - 1];
    if (prev) {
      const gap = item.x - (prev.x + prev.width);
      if (gap > Math.max(prev.size, item.size) * 4) {
        lastBoundary = (prev.x + prev.width + item.x) / 2;
        groups.push({ items: cur, splitAt: lastBoundary });
        cur = [];
      }
    }
    cur.push(item);
  }
  if (cur.length > 0) groups.push({ items: cur, splitAt: lastBoundary });
  return groups;
}

/**
 * Conservative two-column ordering: only when at least 3 split lines share a
 * gutter (within tolerance) AND every line classifies cleanly as left/right
 * (no spanning line), emit the left column top-to-bottom then the right.
 * Anything ambiguous keeps the plain top-to-bottom order.
 */
function orderColumns(lines: SourceLine[]): SourceLine[] {
  const splits = lines.filter((line) => line.splitAt !== undefined);
  if (splits.length < 3) return lines;
  const xs = splits.map((line) => line.splitAt ?? 0).sort((a, b) => a - b);
  const gutter = xs[Math.floor(xs.length / 2)];
  let maxX = 0;
  for (const line of lines) {
    if (line.xEnd > maxX) maxX = line.xEnd;
  }
  const tol = Math.max(10, maxX * 0.03);
  const clustered = splits.filter((line) => Math.abs((line.splitAt ?? 0) - gutter) <= tol);
  if (clustered.length < Math.ceil(splits.length * 0.6)) return lines;

  const left: SourceLine[] = [];
  const right: SourceLine[] = [];
  for (const line of lines) {
    if (line.xEnd <= gutter + tol) left.push(line);
    else if (line.x >= gutter - tol) right.push(line);
    else return lines; // spanning line — keep the conservative row order
  }
  if (left.length < 2 || right.length < 2) return lines;
  return [...left, ...right];
}

/**
 * Joins the items of one segment, inserting a space wherever the horizontal
 * gap looks like a word boundary (pdf.js often splits a line into several
 * items mid-word; column-sized gaps were already split before this point).
 */
function buildLine(segment: Segment, y: number, pageIndex: number): SourceLine {
  const sorted = [...segment.items].sort((a, b) => a.x - b.x);
  let text = '';
  let size = 0;
  let x = Infinity;
  let xEnd = 0;
  let prev: RawItem | null = null;
  for (const item of sorted) {
    if (prev) {
      const gap = item.x - (prev.x + prev.width);
      if (gap > prev.size * 0.25 && !text.endsWith(' ')) {
        text += ' ';
      }
    }
    text += item.str;
    size = Math.max(size, item.size);
    if (item.x < x) x = item.x;
    if (item.x + item.width > xEnd) xEnd = item.x + item.width;
    prev = item;
  }
  return {
    text: text.replace(/\s+/g, ' ').trim(),
    y,
    size,
    x: x === Infinity ? 0 : x,
    xEnd,
    page: pageIndex,
    ...(segment.splitAt !== undefined ? { splitAt: segment.splitAt } : {}),
  };
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

/** Normalizes a list line (content escaped), or returns null for non-list text. */
function asListItem(text: string): string | null {
  if (BULLET_RE.test(text)) return `- ${escapeMarkdownText(text.replace(BULLET_RE, ''))}`;
  const ordered = /^(\d{1,3}[.)]\s+)(.*)$/.exec(text);
  if (ordered) return `${ordered[1]}${escapeMarkdownText(ordered[2])}`;
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
      blocks.push(`${'#'.repeat(level)} ${escapeMarkdownText(line.text)}`);
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
      paragraph.push(escapeMarkdownText(line.text));
    }
    prev = line;
  }
  flushParagraph();
  flushList();

  return `${blocks.join('\n\n')}\n`;
}
