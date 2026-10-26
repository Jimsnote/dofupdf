import { PdfToolError } from './errors';
import { getPdfLib } from './pdf-lib';
import { loadPdfJsDocument } from './pdfjs';

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

/** Distance from the page edge, in PDF points. */
const MARGIN = 24;

function normalizeRotation(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

/**
 * Prints a page number on every page from `startPage` onwards. Positioning is
 * computed in pdf.js display space and converted back per page, so rotated,
 * cropped, nonzero-origin and UserUnit pages keep the same visible placement.
 * Text is counter-rotated so it remains upright after the reader applies
 * /Rotate. The total in the 'n-of-total' format is the document's page count.
 */
export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const { PDFDocument, degrees, rgb, StandardFonts } = await getPdfLib();
  const color = rgb(0.25, 0.25, 0.25);
  const doc = await PDFDocument.load(bytes);
  const rendered = await loadPdfJsDocument(bytes);
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

  try {
    for (let i = firstIndex; i < total; i += 1) {
      const page = pages[i];
      const pdfPage = await rendered.doc.getPage(i + 1);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const rotation = normalizeRotation(pdfPage.rotate);
      const userUnit = pdfPage.userUnit ?? 1;
      const margin = MARGIN * userUnit;
      const number = startNumber + (i - firstIndex);
      const text =
        options.format === 'n-of-total'
          ? `${number} ${options.connector ?? 'of'} ${total}`
          : `${number}`;
      const textWidth = font.widthOfTextAtSize(text, fontSize) * userUnit;
      const fontSizeDisplay = fontSize * userUnit;

      const y = options.position.startsWith('top')
        ? margin + fontSizeDisplay
        : viewport.height - margin;
      let x: number;
      if (options.position.endsWith('left')) {
        x = margin;
      } else if (options.position.endsWith('right')) {
        x = viewport.width - margin - textWidth;
      } else {
        x = (viewport.width - textWidth) / 2;
      }

      const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
      page.drawText(text, {
        x: pdfX,
        y: pdfY,
        size: fontSize,
        font,
        color,
        rotate: degrees((360 - rotation) % 360),
      });
    }
  } finally {
    await rendered.destroy();
  }

  return doc.save();
}
