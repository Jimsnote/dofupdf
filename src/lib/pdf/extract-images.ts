import { PdfToolError } from './errors';
import { getPdfjs, loadPdfJsDocument } from './pdfjs';
import { parsePageRanges } from './page-ranges';

export interface ExtractedImage {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Hard cap so a malicious/degenerate PDF cannot fill device memory. */
const MAX_IMAGES = 200;

interface PdfImageObject {
  /** pdf.js v6 resolves embedded images as an ImageBitmap… */
  bitmap?: ImageBitmap;
  /** …while inline images arrive as raw pixel data. */
  data?: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  kind?: number; // ImageKind: 1=GRAYSCALE_1BPP, 2=RGB_24BPP, 3=RGBA_32BPP
}

/**
 * Image masks arrive from the operator list as {width, height, data} without
 * `kind`, and `data` can be a binary string. Normalize them to 1bpp grayscale
 * so they go through the same canvas path as decoded images.
 */
function normalizeMaskObject(obj: {
  width: number;
  height: number;
  data?: Uint8Array | string;
}): PdfImageObject {
  let bytes: Uint8Array;
  if (typeof obj.data === 'string') {
    bytes = new Uint8Array(obj.data.length);
    for (let i = 0; i < obj.data.length; i += 1) bytes[i] = obj.data.charCodeAt(i) & 0xff;
  } else {
    bytes = obj.data ?? new Uint8Array(0);
  }
  return { width: obj.width, height: obj.height, data: bytes, kind: 1 };
}

/** Paints a pdf.js image object onto a canvas (ImageBitmap or raw pixels). */
function imageObjectToCanvas(obj: PdfImageObject): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = obj.width;
  canvas.height = obj.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PdfToolError('generic', 'Canvas 2D is not available');
  if (obj.bitmap) {
    ctx.drawImage(obj.bitmap, 0, 0);
    return canvas;
  }
  if (!obj.data || obj.kind === undefined) {
    throw new PdfToolError('generic', 'Unsupported image object');
  }
  const src = obj.data;
  const imageData = ctx.createImageData(obj.width, obj.height);
  const dest = imageData.data;
  const pixels = obj.width * obj.height;
  if (obj.kind === 3) {
    dest.set(src.subarray(0, pixels * 4));
  } else if (obj.kind === 2) {
    for (let s = 0, d = 0; s < pixels * 3; s += 3, d += 4) {
      dest[d] = src[s];
      dest[d + 1] = src[s + 1];
      dest[d + 2] = src[s + 2];
      dest[d + 3] = 255;
    }
  } else {
    // 1 bit per pixel grayscale, rows padded to whole bytes
    const rowBytes = Math.ceil(obj.width / 8);
    for (let y = 0; y < obj.height; y += 1) {
      for (let x = 0; x < obj.width; x += 1) {
        const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const value = bit ? 255 : 0;
        const d = (y * obj.width + x) * 4;
        dest[d] = value;
        dest[d + 1] = value;
        dest[d + 2] = value;
        dest[d + 3] = 255;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Samples the canvas (every 16th pixel) for any alpha below 255. */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4 * 16) {
    if (data[i] < 255) return true;
  }
  return false;
}

/**
 * FNV-1a over the pixel bytes — dedupes unkeyed images (inline images and
 * masks carry no object-store key, so identical content is extracted once).
 */
function contentKey(obj: PdfImageObject): string | null {
  if (!obj.data) return null;
  let hash = 0x811c9dc5;
  const data = obj.data;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return `${obj.width}x${obj.height}:${obj.kind ?? 1}:${data.length}:${hash >>> 0}`;
}

async function canvasToBytes(canvas: HTMLCanvasElement, png: boolean): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.92),
  );
  if (!blob) throw new PdfToolError('generic', 'Canvas export failed');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Extracts the embedded raster images of a PDF (photos, scans, logos) as
 * individual image files. Images with an alpha channel are saved as PNG,
 * everything else as JPEG q0.92. Repeated references to the same image are
 * extracted only once. Runs entirely in the browser via pdf.js.
 */
export async function extractImagesFromPdf(
  bytes: Uint8Array,
  options: { range?: string; onFound?: (count: number) => void } = {},
): Promise<ExtractedImage[]> {
  const { doc, numPages, destroy } = await loadPdfJsDocument(bytes);
  try {
    const indices = options.range
      ? parsePageRanges(options.range, numPages)
      : Array.from({ length: numPages }, (_, i) => i);
    const { OPS } = await getPdfjs();
    const out: ExtractedImage[] = [];
    const seen = new Set<string>();

    for (const pageIndex of indices) {
      const page = await doc.getPage(pageIndex + 1);
      const ops = await page.getOperatorList();
      // Register interest in every image object FIRST, then force one render:
      // pdf.js resolves image data only while rendering, and clears the object
      // store afterwards — so harvest inside the resolution callbacks.
      interface FoundImage {
        obj: PdfImageObject;
        key: string | null;
        /** ステンシルマスクは透過情報を持たないが 1bpp なので PNG で出す。 */
        mask?: boolean;
      }
      const found: FoundImage[] = [];
      const pending: Promise<void>[] = [];
      const resolveNamed = (objId: string) => {
        pending.push(
          new Promise<void>((resolve) => {
            try {
              page.objs.get(objId, (data: PdfImageObject) => {
                if (data) found.push({ obj: data, key: objId });
                resolve();
              });
            } catch {
              resolve(); // unresolvable reference — skip
            }
          }),
        );
      };
      for (let i = 0; i < ops.fnArray.length; i += 1) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i] ?? [];
        // 実測した pdf.js 6.1 の引数形状（optimizer は pdf.worker.mjs 側）:
        //   paintImageXObject        [objId, w, h]
        //   paintImageXObjectRepeat  [objId, scaleX, scaleY, positions]（同一参照の反復）
        //   paintInlineImageXObject  [imgData]
        //   paintInlineImageXObjectGroup [mergedImgData, map]（連続 inline の結合済み1枚）
        //   paintImageMaskXObject    [maskObj]
        //   paintImageMaskXObjectRepeat [maskObj, scaleX, skewY?, scaleY, positions]（同一 mask）
        //   paintImageMaskXObjectGroup  [maskObj[]]（異なる mask の束）
        if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
          const arg: unknown = args[0];
          if (typeof arg === 'string') {
            resolveNamed(arg);
          } else if (arg && typeof arg === 'object') {
            found.push({ obj: arg as PdfImageObject, key: null });
          }
        } else if (fn === OPS.paintInlineImageXObject || fn === OPS.paintInlineImageXObjectGroup) {
          const arg: unknown = args[0];
          if (arg && typeof arg === 'object') {
            found.push({ obj: arg as PdfImageObject, key: null });
          }
        } else if (fn === OPS.paintImageMaskXObject || fn === OPS.paintImageMaskXObjectRepeat) {
          const arg = args[0] as { width: number; height: number; data?: Uint8Array | string } | null;
          if (arg && typeof arg === 'object' && arg.width && arg.height) {
            found.push({ obj: normalizeMaskObject(arg), key: null, mask: true });
          }
        } else if (fn === OPS.paintImageMaskXObjectGroup) {
          const images = args[0] as
            | { width: number; height: number; data?: Uint8Array | string }[]
            | null;
          if (Array.isArray(images)) {
            for (const m of images) {
              if (m && m.width && m.height) {
                found.push({ obj: normalizeMaskObject(m), key: null, mask: true });
              }
            }
          }
        }
      }
      const viewport = page.getViewport({ scale: 1 });
      const triggerCanvas = document.createElement('canvas');
      triggerCanvas.width = Math.max(1, Math.ceil(viewport.width));
      triggerCanvas.height = Math.max(1, Math.ceil(viewport.height));
      await page.render({
        canvas: triggerCanvas,
        viewport,
        background: '#ffffff',
      }).promise;
      await Promise.all(pending);

      for (const { obj, key, mask } of found) {
        if (!obj || (!obj.bitmap && !obj.data) || !obj.width || !obj.height) continue;
        // 命名画像はオブジェクト ID、inline・mask は内容ハッシュで重複排除
        const dedupeKey = key ?? contentKey(obj);
        if (dedupeKey) {
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
        }
        try {
          const canvas = imageObjectToCanvas(obj);
          const png = mask ? true : obj.bitmap ? hasTransparency(canvas) : obj.kind === 3;
          const bytes2 = await canvasToBytes(canvas, png);
          out.push({
            name: `page-${pageIndex + 1}-image-${out.length + 1}.${png ? 'png' : 'jpg'}`,
            bytes: bytes2,
            width: obj.width,
            height: obj.height,
          });
          options.onFound?.(out.length);
        } catch {
          // 1枚の異常でバッチ全体を落とさない
          continue;
        }
        if (out.length >= MAX_IMAGES) return out;
      }
    }
    if (out.length === 0) {
      throw new PdfToolError('no-images', 'No embedded images were found in this PDF.');
    }
    return out;
  } finally {
    await destroy();
  }
}
