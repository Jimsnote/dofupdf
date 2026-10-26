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
 * blue. The computed alpha is MULTIPLIED into the source alpha, so pixels
 * that were already (semi-)transparent — e.g. transparent black ink in a
 * pre-cutout PNG — stay transparent instead of turning opaque.
 */
export function removeWhiteBackground(image: RgbaImage, threshold: number): void {
  const t = Math.min(Math.max(threshold, 0.05), 0.98);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const ink = lum >= t ? 0 : Math.min(255, Math.round(255 * (1 - lum / t)));
    data[i + 3] = Math.round((ink * data[i + 3]) / 255);
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

/** Hard input budget, checked BEFORE any decode: 20 MB per signature image. */
export const MAX_SIGNATURE_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Decode budget for total source pixels. JPEG/HEIC decoders can downscale
 * during decode (DCT scaling), so oversized JPEGs are resized rather than
 * rejected; PNG has no efficient partial decode, so a PNG above this budget
 * is rejected up front (from the header, before decoding).
 */
export const MAX_SIGNATURE_TOTAL_PIXELS = 40_000_000;

export interface ImageHeadInfo {
  width: number;
  height: number;
  png: boolean;
  /** JPEG EXIF orientation 1..8 (1 when absent or unreadable); PNG always 1. */
  orientation: number;
}

/**
 * Reads the natural width/height from the leading bytes of a PNG or JPEG
 * without decoding pixels, plus the JPEG EXIF orientation. Returns null when
 * the format is unknown or the header cannot be found within the provided
 * prefix.
 */
export function readImageDimensionsHead(
  bytes: Uint8Array,
): ImageHeadInfo | null {
  const be32 = (o: number) =>
    ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const be16 = (o: number) => (bytes[o] << 8) | bytes[o + 1];
  if (bytes.length >= 24 && be32(0) === 0x89504e47 && be32(12) === 0x49484452) {
    const width = be32(16);
    const height = be32(20);
    if (width > 0 && height > 0) return { width, height, png: true, orientation: 1 };
    return null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Walk the marker segments looking for a SOFn frame header, picking up
    // the EXIF orientation from an APP1 segment on the way (photos rotated
    // on a phone carry the swap in EXIF, which the decoder applies but the
    // raw SOFn dimensions do not reflect).
    let i = 2;
    let orientation = 1;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = be16(i + 2);
      if (length < 2) return null;
      if (marker === 0xe1) {
        const exif = readExifOrientation(bytes, i + 4, i + 2 + length);
        if (exif) orientation = exif;
      }
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = be16(i + 5);
        const width = be16(i + 7);
        if (width > 0 && height > 0) return { width, height, png: false, orientation };
        return null;
      }
      i += 2 + length;
    }
    return null;
  }
  return null;
}

/**
 * EXIF orientation value from an APP1 payload ("Exif\0\0" + TIFF/IFD0), or 0
 * when absent/malformed. Bounds-checked; a big- or little-endian TIFF header
 * is both accepted.
 */
function readExifOrientation(bytes: Uint8Array, start: number, end: number): number {
  if (start + 14 > end) return 0;
  // 'Exif' signature + two NUL bytes.
  if (
    bytes[start] !== 0x45 ||
    bytes[start + 1] !== 0x78 ||
    bytes[start + 2] !== 0x69 ||
    bytes[start + 3] !== 0x66 ||
    bytes[start + 4] !== 0 ||
    bytes[start + 5] !== 0
  ) {
    return 0;
  }
  const t = start + 6; // TIFF header start
  if (t + 8 > end) return 0;
  const le = bytes[t] === 0x49 && bytes[t + 1] === 0x49;
  const be = bytes[t] === 0x4d && bytes[t + 1] === 0x4d;
  if (!le && !be) return 0;
  const u16 = (o: number) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
  const u32 = (o: number) =>
    le
      ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
      : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  if (u16(t + 2) !== 0x2a) return 0;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return 0;
  const count = u16(ifd);
  for (let k = 0; k < count; k += 1) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) return 0;
    if (u16(e) === 0x0112) {
      const value = u16(e + 8);
      return value >= 1 && value <= 8 ? value : 0;
    }
  }
  return 0;
}

/**
 * Swap-aware display dimensions: EXIF orientations 5–8 rotate the stored
 * pixels by 90°, so the DECODED bitmap is portrait when the frame header
 * says landscape. All resize targets must be computed from these, not from
 * the raw SOFn dimensions.
 */
export function displayDims(info: ImageHeadInfo): { width: number; height: number } {
  if (info.orientation >= 5 && info.orientation <= 8) {
    return { width: info.height, height: info.width };
  }
  return { width: info.width, height: info.height };
}

/**
 * Parses the `ispe` (image spatial extents) box of a HEIF/HEIC container
 * without touching the pixel data. `meta → iprp → ipco → ispe` is required
 * structure for every valid HEIC file (ISO/IEC 23008-12), so this gives a
 * dependable size PRE-check before the libheif worker allocates the full
 * RGBA image. Returns null for non-HEIC or malformed input. libheif applies
 * `irot` while decoding, which only swaps the axes — the pixel TOTAL is
 * what the budget checks, so `ispe` alone is sufficient here.
 */
export function readHeicIspe(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const be32 = (o: number) =>
    ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const tagAt = (o: number) =>
    String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  interface BoxRange {
    body: number;
    end: number;
  }
  const findBoxes = (start: number, end: number, type: string): BoxRange[] | null => {
    const boxes: BoxRange[] = [];
    let o = start;
    while (o + 8 <= end) {
      let size = be32(o);
      let header = 8;
      if (size === 1) {
        // 64-bit largesize. These files are capped at 20MB before this
        // parser runs, so any nonzero high word is outside the readable file.
        if (o + 16 > end) return null;
        const high = be32(o + 8);
        if (high !== 0) return null;
        size = be32(o + 12);
        header = 16;
      } else if (size === 0) {
        size = end - o;
      }
      if (size < header || o + size > end) return null;
      if (tagAt(o + 4) === type) boxes.push({ body: o + header, end: o + size });
      o += size;
    }
    return boxes;
  };
  const findBox = (start: number, end: number, type: string): BoxRange | null =>
    findBoxes(start, end, type)?.[0] ?? null;
  const meta = findBox(0, bytes.length, 'meta');
  if (!meta) return null;
  // meta is a fullbox: 4 extra bytes (version/flags) before its children.
  const iprp = findBox(meta.body + 4, meta.end, 'iprp');
  if (!iprp) return null;
  const ipco = findBox(iprp.body, iprp.end, 'ipco');
  if (!ipco) return null;
  // A container can describe thumbnails alongside the primary image. The
  // primary-item association lives in other boxes; for a memory budget the
  // conservative choice is the largest declared image, so a later large entry
  // cannot hide behind a small first one.
  const ispes = findBoxes(ipco.body, ipco.end, 'ispe');
  if (!ispes || ispes.length === 0) return null;
  let largest: { width: number; height: number } | null = null;
  for (const ispe of ispes) {
    // ispe is a fullbox followed by uint32 width + uint32 height.
    if (ispe.body + 12 > ispe.end) return null;
    const width = be32(ispe.body + 4);
    const height = be32(ispe.body + 8);
    if (width <= 0 || height <= 0) return null;
    if (!largest || width * height > largest.width * largest.height) {
      largest = { width, height };
    }
  }
  return largest;
}

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
 * Budgets, in order: raw bytes are capped before any decode; HEIC is size-
 * checked from its `ispe` metadata box BEFORE the libheif worker allocates
 * the full image; natural dimensions are read from the PNG/JPEG header so
 * the (possibly huge) source can be decoded straight to the capped size via
 * `createImageBitmap` resize options — computed from the EXIF-ORIENTED
 * display dimensions, because the decoder applies orientation while resizing.
 * When the header is unreadable the decode is still long-edge-capped (single-
 * side resize request, falling back to full decode where unsupported), and
 * the final 1600px cap is applied to the decoded bitmap UNCONDITIONALLY.
 * Throws PdfToolError('image-too-large') for over-budget input and
 * PdfToolError('image-decode') when the file cannot be read.
 */
export async function decodeSignatureFile(file: File): Promise<DecodedSignature> {
  if (file.size > MAX_SIGNATURE_FILE_BYTES) {
    throw new PdfToolError('image-too-large', file.name);
  }
  try {
    if (isHeicFile(file)) {
      const ispe = readHeicIspe(new Uint8Array(await file.arrayBuffer()));
      if (!ispe) {
        // No reliable pre-check dimension available — refuse instead of
        // letting the worker decode blindly at unknown size.
        throw new PdfToolError('image-decode', file.name);
      }
      if (ispe.width * ispe.height > MAX_SIGNATURE_TOTAL_PIXELS) {
        // HEIC has no scaled decode path — refuse before entering libheif.
        throw new PdfToolError('image-too-large', file.name);
      }
      const jpegBlob = await decodeHeicToJpeg(file);
      return decodeRasterSignature(jpegBlob, file.name);
    }
    return decodeRasterSignature(file, file.name);
  } catch (err) {
    if (err instanceof PdfToolError) throw err;
    throw new PdfToolError('image-decode', file.name);
  }
}

/** Shared PNG/JPEG (and HEIC→JPEG) raster decode with size budgeting. */
async function decodeRasterSignature(blob: Blob, name: string): Promise<DecodedSignature> {
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const natural = readImageDimensionsHead(head);
  if (natural && natural.png && natural.width * natural.height > MAX_SIGNATURE_TOTAL_PIXELS) {
    // PNG has no cheap scaled decode path — refuse rather than allocate.
    throw new PdfToolError('image-too-large', name);
  }
  let bitmap: ImageBitmap | null = null;
  if (natural) {
    const display = displayDims(natural);
    const scale = Math.min(1, MAX_EDGE / Math.max(display.width, display.height));
    if (scale < 1) {
      try {
        bitmap = await createImageBitmap(blob, {
          resizeWidth: Math.max(1, Math.round(display.width * scale)),
          resizeHeight: Math.max(1, Math.round(display.height * scale)),
          resizeQuality: 'high',
          imageOrientation: 'from-image',
        });
      } catch {
        bitmap = null;
      }
    }
  } else {
    // Header not found inside the window (e.g. padded metadata pushes the
    // SOF past 64 KiB): ask for a long-edge-capped decode instead of skipping
    // the cap — Chromium preserves the aspect ratio from a single resize
    // dimension. UAs that reject the option fall through to full decode,
    // where the bitmap-based caps below still apply.
    try {
      bitmap = await createImageBitmap(blob, {
        resizeWidth: MAX_EDGE,
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
    } catch {
      bitmap = null;
    }
  }
  if (!bitmap) {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  }
  try {
    if (bitmap.width * bitmap.height > MAX_SIGNATURE_TOTAL_PIXELS) {
      // Resize options unsupported/absent and the full decode is huge.
      throw new PdfToolError('image-too-large', name);
    }
    // Long-edge cap applied to the DECODED bitmap, unconditionally: it
    // reflects the real (EXIF-oriented, resize-honored-or-not) dimensions,
    // so an unreadable header can never bypass MAX_EDGE.
    const outScale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * outScale));
    canvas.height = Math.max(1, Math.round(bitmap.height * outScale));
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
