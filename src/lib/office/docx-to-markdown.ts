import { PdfToolError } from '../pdf/errors';
import { isSafeLinkHref } from '../markdown-safety';
import { getMammoth, getTurndown } from './lazy-office';
import { assertZipBudget } from './zip-budget';

/**
 * Converts a .docx document to Markdown in the browser: mammoth extracts a
 * semantic HTML tree (headings, lists, tables, bold/italic) and Turndown
 * renders it as clean Markdown. Legacy .doc is not supported (mammoth only
 * reads OOXML) — the caller UI restricts the picker to .docx.
 *
 * The .docx ZIP container gets a declared-size budget check before parsing
 * (zip-bomb guard), and links with exotic protocols (javascript:, data:…)
 * degrade to plain text so the downloaded Markdown stays inert.
 */
export async function docxToMarkdown(bytes: Uint8Array): Promise<string> {
  assertZipBudget(bytes);
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
  } catch (err) {
    if (err instanceof PdfToolError) throw err;
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
  // Keep only http(s)/mailto/relative links; anything else becomes text.
  turndown.addRule('safeLinks', {
    filter: 'a',
    replacement: (content, node) => {
      const href =
        typeof (node as { getAttribute?: (name: string) => string | null }).getAttribute ===
        'function'
          ? ((node as { getAttribute: (name: string) => string | null }).getAttribute('href') ?? '')
          : '';
      if (href && isSafeLinkHref(href)) return `[${content}](${href})`;
      return content;
    },
  });
  const markdown = turndown.turndown(html);
  // Collapse the 3+ blank lines Turndown tends to leave between blocks.
  return markdown.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
