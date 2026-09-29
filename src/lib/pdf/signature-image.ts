/**
 * Signature photo processing: white-background removal and content cropping.
 *
 * The pixel transforms take plain RGBA arrays so they are Node-testable; the
 * browser-only decode/canvas plumbing lives in `processSignatureImage` at the
 * bottom of this file.
 */

export interface RgbaImage {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/**
 * True when at least one pixel is (nearly) transparent — used to default the
 * "remove white background" toggle off for PNGs the user already cut out.
 */
export function hasTransparency(image: RgbaImage): boolean {
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

/**
 * Turns a paper photo into a transparent-ink image in place: each pixel's
 * luminance becomes its alpha (dark ink stays, light paper disappears), with
 * a soft ramp controlled by `threshold` (0..1 — pixels at or above this
 * luminance become fully transparent). RGB is preserved, so blue ink stays
 * blue.
 */
export function removeWhiteBackground(image: RgbaImage, threshold: number): void {
  const t = Math.min(Math.max(threshold, 0.05), 0.98);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    data[i + 3] = lum >= t ? 0 : Math.min(255, Math.round(255 * (1 - lum / t)));
  }
}

/**
 * Crops an RGBA image to the bounding box of pixels above the alpha floor
 * (plus a small padding). Returns null when the image is empty.
 */
export function cropToContent(image: RgbaImage, padding = 4): RgbaImage | null {
  const { data, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  const outWidth = maxX - minX + 1;
  const outHeight = maxY - minY + 1;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const srcStart = ((minY + y) * width + minX) * 4;
    out.set(data.subarray(srcStart, srcStart + outWidth * 4), y * outWidth * 4);
  }
  return { data: out, width: outWidth, height: outHeight };
}

// ---- browser-only plumbing below (decode via canvas) ----

import { decodeHeicToJpeg } from './heic-to-pdf';
import { canvasToBlob } from './pdfjs';
import { PdfToolError } from './errors';

/** Long-edge cap for decoded photos — plenty for a signature stamp. */
const MAX_EDGE = 1600;

export interface DecodedSignature extends RgbaImage {
  /** True when the source image already had transparent pixels. */
  hadAlpha: boolean;
}

function isHeicFile(file: File): boolean {
  return (
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

/**
 * Decodes a signature image file (PNG/JPG, or HEIC via the shared libheif
 * decoder), downscales it, and returns raw RGBA pixels for reprocessing.
 * Throws PdfToolError('image-decode') when the file cannot be read.
 */
export async function decodeSignatureFile(file: File): Promise<DecodedSignature> {
  try {
    const blob = isHeicFile(file) ? await decodeHeicToJpeg(file) : file;
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D is not available');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const image: RgbaImage = {
        data: frame.data,
        width: frame.width,
        height: frame.height,
      };
      return { ...image, hadAlpha: hasTransparency(image) };
    } finally {
      bitmap.close();
    }
  } catch (err) {
    if (err instanceof PdfToolError) throw err;
    throw new PdfToolError('image-decode', file.name);
  }
}

export interface ProcessedSignature {
  dataUrl: string;
  aspect: number;
}

/**
 * Applies white-background removal (optional) and crops to the ink, then
 * returns a PNG data URL ready to become a stamp.
 */
export async function renderSignature(
  source: RgbaImage,
  options: { removeBg: boolean; threshold: number },
): Promise<ProcessedSignature | null> {
  const working: RgbaImage = {
    data: new Uint8ClampedArray(source.data),
    width: source.width,
    height: source.height,
  };
  if (options.removeBg) removeWhiteBackground(working, options.threshold);
  const cropped = cropToContent(working);
  if (!cropped) return null;
  const canvas = document.createElement('canvas');
  canvas.width = cropped.width;
  canvas.height = cropped.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  const frame = new ImageData(cropped.data, cropped.width, cropped.height);
  ctx.putImageData(frame, 0, 0);
  const blob = await canvasToBlob(canvas, 'image/png');
  const buffer = await blob.arrayBuffer();
  // CSP-safe data URL (fetch(data:) is blocked by connect-src).
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return {
    dataUrl: `data:image/png;base64,${btoa(binary)}`,
    aspect: cropped.width / cropped.height,
  };
}
