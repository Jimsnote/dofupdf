import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Lazily loads pdf.js so it never lands in the first-paint bundle, and points
 * its worker at the static asset webpack emits for `pdf.worker.min.mjs`
 * (resolved via `new URL(..., import.meta.url)`). The workerSrc assignment is
 * browser-only: under bare Node (tests) the caller sets it explicitly.
 */
export function getPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      if (typeof document !== 'undefined') {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * A loaded pdf.js document plus its cleanup handle. In pdf.js v6 `destroy()`
 * lives on the loading task, not on `PDFDocumentProxy`, so the two are kept
 * together here.
 */
export interface PdfJsDocument {
  doc: PDFDocumentProxy;
  numPages: number;
  destroy(): Promise<void>;
}

/**
 * Opens a PDF with pdf.js. The bytes are copied because pdf.js transfers the
 * buffer to its worker, which would neuter the caller's copy.
 */
export async function loadPdfJsDocument(bytes: Uint8Array): Promise<PdfJsDocument> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  return { doc, numPages: doc.numPages, destroy: () => task.destroy() };
}

async function renderToCanvas(
  page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>,
  scale: number,
  rotation?: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({
    scale,
    ...(rotation !== undefined ? { rotation } : {}),
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  // White background so transparent pages don't go black in JPEG output.
  await page.render({ canvas, viewport, background: '#ffffff' }).promise;
  return canvas;
}

/**
 * Renders a small page preview (1-based page number) as a JPEG data URL.
 * `extraRotation` is stacked on the page's own rotation so the thumbnail
 * always shows the orientation the organized output will have.
 */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  extraRotation: number,
  targetWidth: number,
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const rotation = (page.rotate + extraRotation) % 360;
  const unscaled = page.getViewport({ scale: 1, rotation });
  const canvas = await renderToCanvas(page, targetWidth / unscaled.width, rotation);
  return canvas.toDataURL('image/jpeg', 0.75);
}

/**
 * One rendered page plus a flag telling the caller whether the requested DPI
 * had to be reduced to stay within the canvas size limit.
 */
export interface RenderedPage {
  canvas: HTMLCanvasElement;
  clamped: boolean;
}

/**
 * Renders a page (1-based) at export quality to a canvas. Scale is `dpi/72`;
 * the page's own rotation is respected automatically. When `maxPixels` is
 * given (e.g. the iOS canvas limit of 16,777,216 pixels), the scale is
 * reduced until the bitmap fits, and the result is flagged as clamped.
 */
export async function renderPageAtDpi(
  doc: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  maxPixels?: number,
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber);
  let scale = dpi / 72;
  let clamped = false;
  if (maxPixels) {
    const base = page.getViewport({ scale: 1 });
    if (base.width * base.height * scale * scale > maxPixels) {
      scale = Math.sqrt(maxPixels / (base.width * base.height));
      clamped = true;
    }
  }
  const canvas = await renderToCanvas(page, scale);
  return { canvas, clamped };
}

/** Promisified `canvas.toBlob`. */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality,
    );
  });
}
