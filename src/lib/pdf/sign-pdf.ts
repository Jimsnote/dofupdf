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
 * The part of a pdf.js `PageViewport` we need. Keeping it structural lets
 * tests pass a real viewport without importing pdf.js types here.
 */
export interface PdfPointViewport {
  /**
   * pdf.js declares this as `any[]`, but it always returns exactly the two
   * mapped coordinates — `readonly number[]` stays compatible with the real
   * `PageViewport` type while keeping this module pdf.js-free.
   */
  convertToPdfPoint(x: number, y: number): readonly number[];
}

/**
 * Maps a rect in pdf.js display space (viewport units at the viewport's own
 * scale, top-left origin, page rotation already applied) into pdf-lib content
 * space (unrotated user space, bottom-left origin) by converting the two
 * diagonal corners with the viewport's own `convertToPdfPoint`. This is the
 * single source of truth for rotation, CropBox offsets, non-zero page origins
 * and UserUnit — no hand-rolled per-angle math. Width/height stay positive by
 * min/abs normalization; the caller matches orientation by pre-rotating the
 * signature image the other way.
 */
export function displayRectToPdf(rect: DisplayRect, viewport: PdfPointViewport): DisplayRect {
  const [ax, ay] = viewport.convertToPdfPoint(rect.x, rect.y);
  const [bx, by] = viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

/** Byte-for-byte equality used to verify hash cache hits. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Content key (SHA-256 hex) for signature PNG bytes so identical images embed
 * once. Falls back to a 64-bit FNV-1a over the bytes when `crypto.subtle` is
 * unavailable (non-secure contexts). Every cache hit is additionally verified
 * byte-for-byte against the stored source (`bytesEqual`), so even a
 * hypothetical hash collision can never embed the wrong signature.
 */
async function contentKey(png: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    // `slice()` re-parents the bytes onto a plain ArrayBuffer (TS 5.7
    // typed-buffer rule: BufferSource rejects ArrayBufferLike views).
    const digest = await globalThis.crypto.subtle.digest('SHA-256', png.slice());
    let hex = '';
    const view = new Uint8Array(digest);
    for (let i = 0; i < view.length; i += 1) hex += view[i].toString(16).padStart(2, '0');
    return `sha:${hex}`;
  }
  // BigInt(...) calls instead of `n` literals: the project TS target is below
  // ES2020, which bans literal syntax even though every runtime here has it.
  const MASK64 = BigInt('0xffffffffffffffff');
  const PRIME = BigInt('0x100000001b3');
  let h1 = BigInt('0xcbf29ce484222325') & MASK64;
  let h2 = PRIME;
  for (let i = 0; i < png.length; i += 1) {
    h1 = ((h1 ^ BigInt(png[i])) * PRIME) & MASK64;
    h2 = ((h2 ^ BigInt(png[i])) * BigInt('0x01000193')) & MASK64;
  }
  return `fnv:${h1.toString(16)}:${h2.toString(16)}:${png.length}`;
}

/**
 * Stamps signature images onto the given pages of a PDF and returns the
 * signed document. Pure pdf-lib work — Node-testable. The caller owns the
 * coordinate conversion (screen px ↔ PDF pt, including the flipped Y axis).
 * Identical PNG bytes are embedded into the document only once and the
 * resulting `PDFImage` is reused for every placement, so repeated stamps
 * (multi-page signing, hanko slice repeats) no longer duplicate the image.
 */
export async function applySignatures(
  pdfBytes: Uint8Array,
  placements: SignaturePlacement[],
): Promise<Uint8Array> {
  if (placements.length === 0) throw new Error('No signatures to apply');
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.load(pdfBytes);
  const pageCount = doc.getPageCount();

  const embedded = new Map<
    string,
    { png: Uint8Array; image: Awaited<ReturnType<typeof doc.embedPng>> }
  >();
  for (const placement of placements) {
    if (placement.page < 0 || placement.page >= pageCount) {
      throw new Error(`Page index ${placement.page} out of bounds (${pageCount} pages)`);
    }
    const key = await contentKey(placement.png);
    const hit = embedded.get(key);
    // Hash hit alone is not trusted: verify the bytes actually match, so a
    // (SHA-256 or fallback FNV) collision could never reuse the wrong image.
    let image: Awaited<ReturnType<typeof doc.embedPng>> | null =
      hit && bytesEqual(hit.png, placement.png) ? hit.image : null;
    if (!image) {
      image = await doc.embedPng(placement.png);
      if (!hit) embedded.set(key, { png: placement.png, image });
    }
    const page = doc.getPage(placement.page);
    page.drawImage(image, {
      x: placement.rect.x,
      y: placement.rect.y,
      width: placement.rect.width,
      height: placement.rect.height,
    });
  }

  return doc.save();
}
