import { csvCell, dedupeNames } from './invoice-meta';

/**
 * Batch-processing helpers for the password tools (W2/W3): output filename
 * rules and the Pro processing-log CSV. Pure functions, Node-testable.
 */

export type NameRule = 'original' | 'suffix' | 'serial';

/**
 * Applies the filename rule to one original name (extension kept).
 *  - original: report.pdf        → report.pdf
 *  - suffix:   report.pdf        → report_protected.pdf
 *  - serial:   report.pdf (idx 0) → 001_report.pdf
 */
export function applyNameRule(
  originalName: string,
  rule: NameRule,
  index: number,
  suffix = '_protected',
): string {
  const dot = originalName.lastIndexOf('.');
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = dot > 0 ? originalName.slice(dot) : '.pdf';
  if (rule === 'serial') {
    return `${String(index + 1).padStart(3, '0')}_${stem}${ext}`;
  }
  if (rule === 'suffix') {
    return `${stem}${suffix}${ext}`;
  }
  return `${stem}${ext}`;
}

/** Applies the rule to a whole batch and dedupes collisions (invoice-meta). */
export function applyNameRuleBatch(
  names: string[],
  rule: NameRule,
  suffix = '_protected',
): string[] {
  return dedupeNames(names.map((name, index) => applyNameRule(name, rule, index, suffix)));
}

export interface BatchLogRow {
  originalName: string;
  outputName: string;
  /** '完了' or '失敗'（UI コピー側の語彙に合わせる）。 */
  status: string;
  /** ローカル時刻（ISO 8601）。 */
  processedAt: string;
}

/**
 * Builds log.csv (BOM + CRLF + RFC4180 quoting, formula-neutralized via the
 * shared csvCell) with the fixed column order from the spec.
 */
export function buildLogCsv(rows: BatchLogRow[]): string {
  const header = ['元ファイル名', '出力ファイル名', 'ステータス', '処理時刻'];
  const lines = [header, ...rows.map((r) => [r.originalName, r.outputName, r.status, r.processedAt])];
  return `\uFEFF${lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
