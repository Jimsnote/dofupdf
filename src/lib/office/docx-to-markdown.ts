import { PdfToolError } from '../pdf/errors';
import { getMammoth, getTurndown } from './lazy-office';

/**
 * Converts a .docx document to Markdown in the browser: mammoth extracts a
 * semantic HTML tree (headings, lists, tables, bold/italic) and Turndown
 * renders it as clean Markdown. Legacy .doc is not supported (mammoth only
 * reads OOXML) — the caller UI restricts the picker to .docx.
 */
export async function docxToMarkdown(bytes: Uint8Array): Promise<string> {
  const mammoth = await getMammoth();
  let html: string;
  try {
    // The browser build of mammoth reads `arrayBuffer`; the Node build (tests,
    // SSR) only reads `buffer`. Pass both so the call is isomorphic.
    const input = {
      arrayBuffer: bytes.slice().buffer as ArrayBuffer,
      ...(typeof Buffer !== 'undefined' ? { buffer: Buffer.from(bytes) } : {}),
    };
    const result = await mammoth.convertToHtml(input);
    html = result.value;
  } catch {
    throw new PdfToolError(
      'corruptedFile',
      'This file could not be read as a valid .docx document.',
    );
  }

  const TurndownService = (await getTurndown()).default;
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  const markdown = turndown.turndown(html);
  // Collapse the 3+ blank lines Turndown tends to leave between blocks.
  return markdown.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
