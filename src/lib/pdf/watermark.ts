import type { PDFDocument, PDFImage, PDFPage } from '@cantoo/pdf-lib';
import { getPdfLib, type PdfLib } from './pdf-lib';
import { loadPdfJsDocument } from './pdfjs';

export type WatermarkLayout = 'tile' | 'center';

/**
 * How big one stamp is drawn: either an absolute width in PDF points (used
 * for text watermarks, where the font size fixes the size) or a fraction of
 * each page's width (used for image watermarks). Height follows the image
 * aspect ratio.
 */
export type WatermarkSize =
  | { kind: 'points'; width: number }
  | { kind: 'pageFraction'; fraction: number };

export interface ApplyImageWatermarkOptions {
  /** Stamp opacity, clamped to the 0.05–0.5 range the UI offers. */
  opacity: number;
  layout: WatermarkLayout;
  size: WatermarkSize;
}

/** The 45° diagonal every stamp shows at in display space. */
const ROTATION = 45;

function clampOpacity(opacity: number): number {
  return Math.min(0.5, Math.max(0.05, opacity));
}

function normalizeRotation(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}

/** Embeds PNG or JPEG bytes, detected from the magic bytes. */
function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  const isPng =
    bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  return isPng ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

/**
 * Draws one stamp so its center lands on (cx, cy) in PDF user space. pdf-lib
 * rotates about the (x, y) origin passed to drawImage, so the origin is solved
 * backwards from the desired center and angle.
 */
function drawStampCentered(
  degrees: PdfLib['degrees'],
  page: PDFPage,
  image: PDFImage,
  cx: number,
  cy: number,
  width: number,
  height: number,
  opacity: number,
  angle: number,
): void {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = cx - (width / 2) * cos + (height / 2) * sin;
  const y = cy - (width / 2) * sin - (height / 2) * cos;
  page.drawImage(image, {
    x,
    y,
    width,
    height,
    rotate: degrees(angle),
    opacity,
  });
}

/**
 * Stamps an image watermark on every page of the document. `imageBytes` may
 * be PNG or JPEG — for text watermarks the UI renders the text to a PNG on an
 * offscreen canvas first (system fonts, so any language works) and hands the
 * PNG over here. Layout 'center' draws a single diagonal stamp per page;
 * 'tile' repeats it on a staggered grid that overhangs the page edges.
 * Placement is computed in pdf.js display space, then converted back, so page
 * rotation, CropBox and UserUnit do not move or additionally rotate the stamp.
 */
export async function applyImageWatermark(
  pdfBytes: Uint8Array,
  imageBytes: Uint8Array,
  options: ApplyImageWatermarkOptions,
): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes);
  const rendered = await loadPdfJsDocument(pdfBytes);
  const image = await embedImage(doc, imageBytes);
  const aspect = image.height / image.width;
  const opacity = clampOpacity(options.opacity);

  try {
    for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
      const page = doc.getPage(pageIndex);
      const pdfPage = await rendered.doc.getPage(pageIndex + 1);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const rotation = normalizeRotation(pdfPage.rotate);
      const userUnit = pdfPage.userUnit ?? 1;
      const angle = (ROTATION - rotation + 360) % 360;

      const requested =
        options.size.kind === 'points'
          ? options.size.width
          : (viewport.width * options.size.fraction) / userUnit;
      // Constrain the 45° bounding box, not just the unrotated width, so a
      // square stamp cannot spill past either visible edge.
      const maxVisible =
        (Math.min(viewport.width, viewport.height) / userUnit) *
        (options.layout === 'tile' ? 0.6 : 0.9);
      const maxWidth = (maxVisible * Math.SQRT2) / (1 + aspect);
      const width = Math.min(requested, maxWidth);
      const height = width * aspect;

      if (options.layout === 'center') {
        const [cx, cy] = viewport.convertToPdfPoint(
          viewport.width / 2,
          viewport.height / 2,
        );
        drawStampCentered(degrees, page, image, cx, cy, width, height, opacity, angle);
      } else {
        // Tile positions are display-space centers; each is converted back to
        // the page's own user space before drawing.
        const bbox = (width + height) * userUnit * Math.SQRT1_2;
        const stepX = bbox + width * userUnit * 0.5;
        const stepY = bbox + Math.max(height * userUnit * 3, width * userUnit * 0.35);
        let row = 0;
        for (let cy = -bbox; cy <= viewport.height + bbox; cy += stepY) {
          const offset = row % 2 === 0 ? 0 : stepX / 2;
          for (let cx = -bbox + offset; cx <= viewport.width + bbox; cx += stepX) {
            const [pdfX, pdfY] = viewport.convertToPdfPoint(cx, cy);
            drawStampCentered(degrees, page, image, pdfX, pdfY, width, height, opacity, angle);
          }
          row += 1;
        }
      }
    }
  } finally {
    await rendered.destroy();
  }

  return doc.save();
}

export interface TextWatermarkPng {
  png: Uint8Array;
  /** Stamp size in PDF points at the requested font size. */
  widthPoints: number;
  heightPoints: number;
}

/** Supersampling factor so the embedded text stays sharp when zoomed. */
const TEXT_SCALE = 4;
/** Widest canvas browsers reliably support (iOS caps at 4096 per dimension). */
const MAX_CANVAS_DIM = 4096;

/**
 * Renders watermark text to a PNG on an offscreen canvas. Drawing text with
 * the device's own fonts (instead of pdf-lib's standard fonts) is what makes
 * non-Latin scripts — Chinese, Arabic, emoji — work in watermarks. Browser
 * only; the returned width in points is handed to `applyImageWatermark` as
 * `{ kind: 'points' }`.
 */
export async function renderTextWatermarkPng(
  text: string,
  fontSize: number,
  color: string,
): Promise<TextWatermarkPng> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  const fontOf = (px: number) =>
    `600 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  let px = fontSize * TEXT_SCALE;
  ctx.font = fontOf(px);
  let width = Math.max(1, Math.ceil(ctx.measureText(text).width + px * 0.5));
  // Long text at a large font can exceed the canvas size limit — shrink the
  // supersampling until it fits. The point size is unaffected.
  if (width > MAX_CANVAS_DIM) {
    px = Math.max(1, Math.floor(px * (MAX_CANVAS_DIM / width)));
    ctx.font = fontOf(px);
    width = Math.max(1, Math.ceil(ctx.measureText(text).width + px * 0.5));
  }
  const scale = px / fontSize;
  const height = Math.max(1, Math.ceil(px * 1.35));
  const padX = px * 0.25;
  // Resizing clears the context state, so the font is set again afterwards.
  canvas.width = width;
  canvas.height = height;
  ctx.font = fontOf(px);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padX, height / 2);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Canvas export failed'))),
      'image/png',
    );
  });
  // Release the canvas backing store immediately.
  canvas.width = 0;
  canvas.height = 0;
  return {
    png: new Uint8Array(await blob.arrayBuffer()),
    widthPoints: width / scale,
    heightPoints: height / scale,
  };
}
