import { PdfToolError } from '../pdf/errors';
import { escapeMarkdownText } from '../markdown-safety';
import { getXlsx } from './lazy-office';
import { assertZipBudget } from './zip-budget';

/**
 * Escape a cell value for a GitHub-flavored Markdown table. Newlines and CRs
 * collapse to spaces; Markdown metacharacters (including the table pipe) are
 * escaped so cell content stays inert in downstream viewers.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return escapeMarkdownText(String(value).replace(/[\r\n]+/g, ' ')).trim();
}

/**
 * Converts an Excel workbook (.xlsx/.xls) to a single Markdown document: one
 * `## Sheet: <name>` section per non-empty sheet, each rendered as a
 * GitHub-flavored Markdown table (first non-empty row becomes the header).
 * Cells are read with `raw: false` so dates and numbers keep their displayed
 * formatting. ZIP containers get a declared-size budget check before parsing.
 */
export async function xlsxToMarkdown(bytes: Uint8Array): Promise<string> {
  assertZipBudget(bytes);
  const XLSX = await getXlsx();
  let workbook;
  try {
    workbook = XLSX.read(bytes, { type: 'array' });
  } catch {
    throw new PdfToolError(
      'corruptedFile',
      'This file could not be read as a valid Excel workbook.',
    );
  }

  const parts: string[] = [];
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });
    if (rows.length === 0) continue;
    // Drop fully empty trailing columns. Iterate instead of spreading into
    // Math.max — a few hundred thousand rows would overflow the call stack.
    let width = 0;
    for (const row of rows) {
      let last = row.length - 1;
      while (last >= 0 && cell(row[last]) === '') last -= 1;
      if (last + 1 > width) width = last + 1;
    }
    if (width === 0) continue;
    const header = rows[0].slice(0, width).map(cell);
    const body = rows.slice(1).map((row) => row.slice(0, width).map(cell));
    const lines = [
      `## Sheet: ${name}`,
      '',
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map((row) => `| ${row.join(' | ')} |`),
    ];
    parts.push(lines.join('\n'));
  }

  if (parts.length === 0) {
    throw new PdfToolError('empty-workbook', 'This workbook contains no data to convert.');
  }
  return `${parts.join('\n\n')}\n`;
}
