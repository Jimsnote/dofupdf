import { getPdfLib } from './pdf-lib';

export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type ImageFitMode = 'fit' | 'fill' | 'original';

export interface ImageInput {
  bytes: Uint8Array;
  type: 'jpg' | 'png';
}

/** A4 page size in PDF points. */
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/**
 * Converts JPG/PNG images into an A4 PDF, one image per page. Images are
 * embedded as-is — EXIF orientation must be normalized upstream (see
 * `image-orientation.ts`), otherwise phone photos would land sideways and
 * the auto/fit calculations below would use the wrong dimensions.
 *
 * Orientation 'auto' picks landscape when the first image is wider than it
 * is tall, otherwise portrait; the choice applies to every page. Fit modes:
 * - 'fit': scale proportionally to fit inside the page, centered (letterbox)
 * - 'fill': scale proportionally to cover the whole page, centered (crop)
 * - 'original': draw at natural pixel size (1px = 1pt), centered
 */
export async function imagesToPdf(
  images: ImageInput[],
  orientation: PageOrientation,
  fitMode: ImageFitMode,
): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const embedded = [];
  for (const image of images) {
    embedded.push(
      image.type === 'jpg' ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes),
    );
  }

  const first = embedded[0];
  const landscape =
    orientation === 'landscape' ||
    (orientation === 'auto' && first.width > first.height);
  const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;

  for (const image of embedded) {
    const page = doc.addPage([pageWidth, pageHeight]);
    let width: number;
    let height: number;
    if (fitMode === 'original') {
      width = image.width;
      height = image.height;
    } else {
      const scale =
        fitMode === 'fit'
          ? Math.min(pageWidth / image.width, pageHeight / image.height)
          : Math.max(pageWidth / image.width, pageHeight / image.height);
      width = image.width * scale;
      height = image.height * scale;
    }
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
  }

  return doc.save();
}
