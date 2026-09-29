import type { ImageInput } from './jpg-to-pdf';

/**
 * Reads the EXIF orientation tag (0x0112) from JPEG bytes. Returns null for
 * non-JPEG data or files without the tag. Pure byte parsing — no DOM needed.
 */
export function readExifOrientation(bytes: Uint8Array): number | null {
  // JPEG SOI marker.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    // SOS — image data starts, so there are no more metadata segments.
    if (marker === 0xda) return null;
    if (marker === 0xe1) {
      // APP1 — the Exif header is "Exif\0\0" followed by a TIFF block.
      const start = offset + 4;
      if (
        start + 8 <= bytes.length &&
        bytes[start] === 0x45 && // E
        bytes[start + 1] === 0x78 && // x
        bytes[start + 2] === 0x69 && // i
        bytes[start + 3] === 0x66 && // f
        bytes[start + 4] === 0 &&
        bytes[start + 5] === 0
      ) {
        return readTiffOrientation(bytes, start + 6, offset + 2 + length);
      }
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

/** Finds tag 0x0112 (orientation) in the first IFD of an Exif TIFF block. */
function readTiffOrientation(bytes: Uint8Array, tiff: number, end: number): number | null {
  if (tiff + 8 > end) return null;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49; // II
  const bigEndian = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d; // MM
  if (!littleEndian && !bigEndian) return null;
  const u16 = (at: number) =>
    littleEndian ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at: number) =>
    littleEndian
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + bytes[at + 3] * 0x1000000
      : bytes[at] * 0x1000000 + ((bytes[at + 1] << 8) | bytes[at + 2]) * 0x100 + bytes[at + 3];
  if (u16(tiff + 2) !== 42) return null;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/**
 * Returns an image ready for PDF embedding. JPEGs carrying a non-trivial
 * EXIF orientation (phone photos shot sideways) are re-encoded through a
 * canvas with the orientation applied — pdf-lib embeds raw pixels and would
 * otherwise place them rotated 90° in the PDF, and every layout decision
 * (auto orientation, fit/fill/original) would be based on the wrong
 * dimensions. PNGs, unrotated JPEGs, and anything the browser fails to
 * decode pass through unchanged, preserving quality and file size.
 */
export async function normalizeImageForPdf(file: File): Promise<ImageInput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
  if (isPng) return { bytes, type: 'png' };
  const orientation = readExifOrientation(bytes);
  if (orientation === null || orientation === 1) {
    return { bytes, type: 'jpg' };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes]), {
      imageOrientation: 'from-image',
    });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is not available');
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Canvas export failed'))),
          'image/jpeg',
          0.92,
        );
      });
      // Release the canvas backing store immediately.
      canvas.width = 0;
      canvas.height = 0;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'jpg' };
    } finally {
      bitmap.close();
    }
  } catch {
    // No imageOrientation support (or a decode hiccup): embed as-is rather
    // than failing the whole conversion.
    return { bytes, type: 'jpg' };
  }
}
