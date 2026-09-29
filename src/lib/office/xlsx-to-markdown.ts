import { PdfToolError } from '../pdf/errors';
import { getXlsx } from './lazy-office';

/** Escape a cell value for a GitHub-flavored Markdown table. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, ' ')
    .trim();
}

/**
 * Converts an Excel workbook (.xlsx/.xls) to a single Markdown document: one
 * `## Sheet: <name>` section per non-empty sheet, each rendered as a
 * GitHub-flavored Markdown table (first non-empty row becomes the header).
 */
export async function xlsxToMarkdown(bytes: Uint8Array): Promise<string> {
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
      defval: '',
      blankrows: false,
    });
    if (rows.length === 0) continue;
    // Drop fully empty trailing columns.
    const width = Math.max(
      ...rows.map((row) => {
        let last = row.length - 1;
        while (last >= 0 && cell(row[last]) === '') last -= 1;
        return last + 1;
      }),
    );
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
    throw new PdfToolError('no-text', 'This workbook contains no data to convert.');
  }
  return `${parts.join('\n\n')}\n`;
}
