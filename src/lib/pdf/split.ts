import type { PDFDocument } from '@cantoo/pdf-lib';
import { PdfToolError } from './errors';
import { getPdfLib } from './pdf-lib';

/** A single output file produced by splitting. */
export interface SplitOutput {
  name: string;
  bytes: Uint8Array;
}

/**
 * Upper bound for the "extract all pages" mode: every page becomes its own
 * PDFDocument held in memory until the ZIP is built, so unbounded documents
 * would exhaust the browser's memory.
 */
export const SPLIT_ALL_MAX_PAGES = 500;

/** Loads a document once so the UI can validate ranges against its length. */
export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

async function extractSegment(
  source: PDFDocument,
  indices: number[],
  name: string,
): Promise<SplitOutput> {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(source, indices);
  for (const page of pages) {
    doc.addPage(page);
  }
  return { name, bytes: await doc.save() };
}

/**
 * Makes `name` unique within `used` by appending `-2`, `-3`, … before the
 * extension. Distinct segments can collapse to the same first–last label
 * (e.g. "1-3" and "1,3"), and JSZip would silently overwrite duplicates.
 */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i += 1) {
    const candidate = `${stem}-${i}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** Extract all pages: every page becomes its own one-page PDF. */
export async function splitAllPages(bytes: Uint8Array): Promise<SplitOutput[]> {
  const { PDFDocument } = await getPdfLib();
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();
  if (pageCount > SPLIT_ALL_MAX_PAGES) {
    throw new PdfToolError('tooManyPages', String(SPLIT_ALL_MAX_PAGES));
  }
  const outputs: SplitOutput[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    outputs.push(await extractSegment(source, [i], `page-${i + 1}.pdf`));
  }
  return outputs;
}

/**
 * Split by ranges: each segment (0-based, deduplicated page indices, e.g.
 * from `parseRangeSegments`) becomes its own PDF. Identical segments are
 * extracted only once, and colliding file names get a numeric suffix.
 */
export async function splitByRanges(
  bytes: Uint8Array,
  segments: number[][],
): Promise<SplitOutput[]> {
  const { PDFDocument } = await getPdfLib();
  const source = await PDFDocument.load(bytes);
  const outputs: SplitOutput[] = [];
  const seenSegments = new Set<string>();
  const usedNames = new Set<string>();
  for (const segment of segments) {
    const key = segment.join(',');
    if (seenSegments.has(key)) continue;
    seenSegments.add(key);
    const first = segment[0] + 1;
    const last = segment[segment.length - 1] + 1;
    const name = uniqueName(
      first === last ? `page-${first}.pdf` : `pages-${first}-${last}.pdf`,
      usedNames,
    );
    outputs.push(await extractSegment(source, segment, name));
  }
  return outputs;
}

/** Split every N pages: consecutive chunks of `n` pages each become a PDF. */
export async function splitEveryNPages(bytes: Uint8Array, n: number): Promise<SplitOutput[]> {
  if (!Number.isInteger(n) || n < 1) {
    throw new PdfToolError('invalidRange', `Pages per file must be a positive integer, got ${n}`);
  }
  const { PDFDocument } = await getPdfLib();
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();
  const outputs: SplitOutput[] = [];
  for (let start = 0; start < pageCount; start += n) {
    const end = Math.min(start + n, pageCount);
    const indices: number[] = [];
    for (let i = start; i < end; i += 1) indices.push(i);
    outputs.push(await extractSegment(source, indices, `pages-${start + 1}-${end}.pdf`));
  }
  return outputs;
}
