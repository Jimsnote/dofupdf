import { PdfToolError } from './errors';

/**
 * Decodes a HEIC/HEIF photo to JPEG bytes in the browser.
 *
 * Uses `heic-to/csp` — a libheif WASM build whose decoder runs inside a Web
 * Worker spawned from a blob URL (that's why it needs the `csp` entry point:
 * zero `eval`, compatible with our Content-Security-Policy — see
 * `public/_headers`: `worker-src blob:` + `script-src 'wasm-unsafe-eval'`).
 * The ~3MB chunk is lazy-loaded on first use and cached by the browser.
 *
 * libheif applies the HEIC `irot` transform while decoding, so photos come
 * out upright; the result is still piped through `normalizeImageForPdf` as a
 * safety net for files that carry a residual EXIF orientation instead.
 *
 * Throws `PdfToolError('heic-decode')` when the file cannot be decoded
 * (unsupported codec variant, truncated download, not actually HEIC).
 */
export async function decodeHeicToJpeg(file: File): Promise<Blob> {
  try {
    const { heicTo } = await import('heic-to/csp');
    return await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  } catch (err) {
    // A failed lazy-chunk download must surface as-is: the UI maps it to the
    // "check your connection" message instead of blaming the file.
    if (
      err instanceof TypeError &&
      /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
        err.message,
      )
    ) {
      throw err;
    }
    throw new PdfToolError('heic-decode', file.name);
  }
}
