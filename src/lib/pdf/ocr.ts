/**
 * OCR（光学字符识别）核心流程：PDF 逐页渲染成图片 → Tesseract 识别 →
 * 每页产出带文字层的 PDF，再用 pdf-lib 合并为一份可搜索 PDF，
 * 同时收集纯文本。全部在浏览器内完成，零上传。
 *
 * Tesseract 引擎（worker.min.js / core wasm / eng 语言包）自托管在
 * public/tesseract/（由 scripts/copy-wasm.mjs 从 node_modules 拷贝），
 * 路径必须与 copy 脚本保持同步。
 */
import { createWorker, type Worker } from 'tesseract.js';
import { getPdfLib } from './pdf-lib';
import { loadPdfJsDocument, renderPageAtDpi } from './pdfjs';

/** 自托管 Tesseract 资源目录（见 scripts/copy-wasm.mjs）。 */
const TESSERACT_PATH = '/tesseract';

export interface OcrProgress {
  /** engine：加载 OCR 引擎/语言包（仅首次）；page：逐页识别 */
  stage: 'engine' | 'page';
  /** 引擎加载阶段的内部状态（如 loading language traineddata） */
  engineStatus?: string;
  /** 当前页码 / 总页数（page 阶段） */
  page?: number;
  pages?: number;
  /** 当前页内识别进度 0..1（page 阶段） */
  pageRatio?: number;
}

export interface OcrResult {
  /** 可搜索 PDF（每页带隐形文字层）的字节 */
  pdfBytes: Uint8Array;
  /** 识别出的纯文本（按页拼接，页间换行分隔） */
  text: string;
}

/**
 * 对 PDF 逐页 OCR。英文 + 日文识别（tessdata 4.0.0_best_int 模型）。
 * 调用方负责把进度映射到 UI；异常直接上抛给调用方的错误归一化。
 */
export async function ocrPdf(
  bytes: Uint8Array,
  dpi: number,
  onProgress: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  const { doc, numPages, destroy } = await loadPdfJsDocument(bytes);
  let worker: Worker | null = null;
  try {
    let currentPage = 0;
    worker = await createWorker(['eng', 'jpn'], 1, {
      workerPath: `${TESSERACT_PATH}/worker.min.js`,
      corePath: TESSERACT_PATH,
      langPath: TESSERACT_PATH,
      logger: (message) => {
        if (message.status === 'recognizing text') {
          onProgress({
            stage: 'page',
            page: currentPage,
            pages: numPages,
            pageRatio: message.progress,
          });
        } else {
          onProgress({ stage: 'engine', engineStatus: message.status });
        }
      },
    });

    const pagePdfs: Uint8Array[] = [];
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
      currentPage = pageNumber;
      onProgress({ stage: 'page', page: pageNumber, pages: numPages, pageRatio: 0 });
      // iOS canvas 像素上限保护（16777216）；超出时自动降 DPI
      const { canvas } = await renderPageAtDpi(doc, pageNumber, dpi, 16777216);
      const { data } = await worker.recognize(canvas, {}, { text: true, pdf: true });
      // tesseract 类型把 pdf 标为 number[]，运行时为字节数组——显式转成 Uint8Array
      if (data.pdf) pagePdfs.push(new Uint8Array(data.pdf));
      pageTexts.push(data.text);
    }

    // 单页直接采用其 PDF；多页用 pdf-lib 合并
    let pdfBytes: Uint8Array;
    if (pagePdfs.length === 1) {
      pdfBytes = pagePdfs[0];
    } else {
      const pdfLib = await getPdfLib();
      const merged = await pdfLib.PDFDocument.create();
      for (const pagePdf of pagePdfs) {
        const src = await pdfLib.PDFDocument.load(pagePdf, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      pdfBytes = await merged.save();
    }

    return { pdfBytes, text: pageTexts.join('\n\n').trim() };
  } finally {
    if (worker) await worker.terminate();
    await destroy();
  }
}
