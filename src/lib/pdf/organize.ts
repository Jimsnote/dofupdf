import { PdfToolError } from './errors';
import { getPdfLib } from './pdf-lib';
import { normalizeRotation } from './rotate';

/** One page in the final document, referencing the source PDF. */
export interface OrganizePageInstruction {
  /** 0-based index of the page in the source document. */
  sourcePageIndex: number;
  /** Extra clockwise rotation to apply on top of the page's own rotation. */
  rotation: 0 | 90 | 180 | 270;
}

/**
 * Rebuilds a PDF from an explicit page sequence: pages are copied from the
 * source document in the given order (deleted pages simply never appear in
 * the sequence) and each page's rotation is increased by its instruction's
 * angle. Throws `PdfToolError('noPages')` when the sequence is empty.
 */
export async function organizePdf(
  bytes: Uint8Array,
  sequence: OrganizePageInstruction[],
): Promise<Uint8Array> {
  if (sequence.length === 0) {
    throw new PdfToolError('noPages', 'The output document needs at least one page');
  }
  const { PDFDocument, degrees } = await getPdfLib();
  const source = await PDFDocument.load(bytes);
  const organized = await PDFDocument.create();
  const pages = await organized.copyPages(
    source,
    sequence.map((entry) => entry.sourcePageIndex),
  );
  pages.forEach((page, index) => {
    const current = page.getRotation().angle;
    page.setRotation(degrees(normalizeRotation(current + sequence[index].rotation)));
    organized.addPage(page);
  });
  return organized.save();
}
