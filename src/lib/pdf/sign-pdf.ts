import { getPdfLib } from './pdf-lib';

export interface SignaturePlacement {
  /** 0-based page index. */
  page: number;
  /** Rectangle in PDF points, origin at the page's bottom-left corner. */
  rect: { x: number; y: number; width: number; height: number };
  /** PNG bytes of the signature image (transparent background expected). */
  png: Uint8Array;
}

export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Maps a rect in pdf.js display space (viewport units, top-left origin, page
 * rotation already applied) into pdf-lib content space (unrotated MediaBox,
 * bottom-left origin). For 90°/270° pages the width/height swap, which the
 * caller matches by pre-rotating the signature image the other way.
 */
export function displayRectToPdf(
  rect: DisplayRect,
  rotation: number,
  mediaWidth: number,
  mediaHeight: number,
): DisplayRect {
  const r = ((rotation % 360) + 360) % 360;
  switch (r) {
    case 90:
      return { x: rect.y, y: rect.x, width: rect.height, height: rect.width };
    case 180:
      return {
        x: mediaWidth - rect.x - rect.width,
        y: mediaHeight - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
      };
    case 270:
      return {
        x: mediaWidth - rect.y - rect.height,
        y: mediaHeight - rect.x - rect.width,
        width: rect.height,
        height: rect.width,
      };
    default:
      return {
        x: rect.x,
        y: mediaHeight - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
      };
  }
}

/**
 * Stamps signature images onto the given pages of a PDF and returns the
 * signed document. Pure pdf-lib work — Node-testable. The caller owns the
 * coordinate conversion (screen px ↔ PDF pt, including the flipped Y axis).
 */
export async function applySignatures(
  pdfBytes: Uint8Array,
  placements: SignaturePlacement[],
): Promise<Uint8Array> {
  if (placements.length === 0) throw new Error('No signatures to apply');
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes);
  const pageCount = doc.getPageCount();

  for (const placement of placements) {
    if (placement.page < 0 || placement.page >= pageCount) {
      throw new Error(`Page index ${placement.page} out of bounds (${pageCount} pages)`);
    }
    const png = await doc.embedPng(placement.png);
    const page = doc.getPage(placement.page);
    page.drawImage(png, {
      x: placement.rect.x,
      y: placement.rect.y,
      width: placement.rect.width,
      height: placement.rect.height,
    });
  }

  return doc.save();
}
