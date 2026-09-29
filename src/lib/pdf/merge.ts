import { getPdfLib } from './pdf-lib';

/**
 * Merges several PDF documents into one, in the order given. Every page of
 * each input document is copied into a fresh output document.
 */
export async function mergePdfs(inputs: Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
  const merged = await PDFDocument.create();
  for (const bytes of inputs) {
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return merged.save();
}
