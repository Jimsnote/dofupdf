import { getPdfLib } from './pdf-lib';

export type RotationAngle = 90 | 180 | 270;

/**
 * Normalizes a summed rotation into the 0–359 range. Dirty PDFs can carry a
 * negative /Rotate value, and a naive `% 360` would keep it negative.
 */
export function normalizeRotation(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Rotates pages clockwise by the given angle, added on top of each page's
 * existing rotation. When `pageIndices` is omitted, every page is rotated;
 * otherwise only the given 0-based indices are.
 */
export async function rotatePdf(
  bytes: Uint8Array,
  angle: RotationAngle,
  pageIndices?: number[],
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await getPdfLib();
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const targets = pageIndices ?? pages.map((_, i) => i);
  for (const index of targets) {
    const page = pages[index];
    if (!page) continue;
    const current = page.getRotation().angle;
    page.setRotation(degrees(normalizeRotation(current + angle)));
  }
  return doc.save();
}
