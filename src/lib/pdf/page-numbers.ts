import { PdfToolError } from './errors';
import { getPdfLib } from './pdf-lib';

export type PageNumberPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type PageNumberFormat = 'n' | 'n-of-total';

export interface PageNumberOptions {
  position: PageNumberPosition;
  format: PageNumberFormat;
  /** Number printed on the first numbered page. */
  startNumber: number;
  /** 1-based page where numbering begins; earlier pages get no number. */
  startPage: number;
  fontSize: number;
  /** Word between number and total in 'n-of-total' format (default 'of'). */
  connector?: string;
}

/** Distance from the page edge, in points. */
const MARGIN = 24;

/**
 * Prints a page number on every page from `startPage` onwards. Numbers are
 * Latin digits, so the standard Helvetica font is all that is needed — no
 * canvas rendering involved. The total in the 'n-of-total' format is the
 * document's page count.
 */
export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await getPdfLib();
  const color = rgb(0.25, 0.25, 0.25);
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  const startPage = Math.floor(options.startPage);
  if (!Number.isFinite(startPage) || startPage < 1 || startPage > total) {
    throw new PdfToolError(
      'rangeOutOfBounds',
      `Numbering cannot start on page ${options.startPage} — the document has ${total} pages`,
    );
  }

  const firstIndex = startPage - 1;
  const fontSize = Number.isFinite(options.fontSize)
    ? Math.min(72, Math.max(6, options.fontSize))
    : 12;
  const startNumber = Number.isFinite(options.startNumber)
    ? Math.max(0, Math.floor(options.startNumber))
    : 0;

  for (let i = firstIndex; i < total; i += 1) {
    const page = pages[i];
    const number = startNumber + (i - firstIndex);
    const text =
      options.format === 'n-of-total'
        ? `${number} ${options.connector ?? 'of'} ${total}`
        : `${number}`;
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    const y = options.position.startsWith('top') ? height - MARGIN - fontSize : MARGIN;
    let x: number;
    if (options.position.endsWith('left')) {
      x = MARGIN;
    } else if (options.position.endsWith('right')) {
      x = width - MARGIN - textWidth;
    } else {
      x = (width - textWidth) / 2;
    }

    page.drawText(text, { x, y, size: fontSize, font, color });
  }

  return doc.save();
}
