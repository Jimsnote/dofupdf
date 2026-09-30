/**
 * 提出前 PDF チェッカーの純粋エンジン。ファイルから集めた事実（サイズ・
 * ページ数・版数・暗号化・フォーム・白紙）を、提出先の規格（プリセット）と
 * 照合して合否を判定する。DOM も pdf-lib も pdf.js も使わないので Node で
 * テストできる。事実収集と UI は呼び出し側の役割。
 */

/** 提出前に問題になり得る検査項目。UI 側の文言キーにも使う。 */
export type CheckId =
  | 'size'
  | 'pages'
  | 'version'
  | 'security'
  | 'form'
  | 'blank'
  | 'scanned'
  | 'corrupt';

export type CheckLevel = 'pass' | 'warn' | 'fail' | 'info';

/** pdf-lib / pdf.js から集めた 1 ファイル分の事実。 */
export interface PdfFacts {
  /** ファイルサイズ（バイト）。 */
  bytes: number;
  /** ページ数。解析できなければ -1。 */
  pageCount: number;
  /** PDF ヘッダの版数（例 '1.7'）。読めなければ空文字。 */
  version: string;
  /** オープンにパスワードを要する（暗号化・セキュリティ設定あり）。 */
  encrypted: boolean;
  /** AcroForm のフォームフィールド数。測れなければ 0。 */
  formFieldCount: number;
  /** 白紙と判定したページ（0 ベース）。 */
  blankPages: number[];
  /** 全ページが画像のみ（テキスト層なし＝スキャン）。 */
  scannedOnly: boolean;
  /** テキスト抽出が失敗／解析不能。 */
  unreadable: boolean;
}

export interface CheckSpec {
  /** 1 ファイルの上限バイト（未設定なら検査せず）。 */
  maxBytes?: number;
  /** ページ数の上限（未設定なら検査せず）。 */
  maxPages?: number;
  /** セキュリティ設定（暗号化）を禁止するか。 */
  forbidSecurity: boolean;
  /** 要求する最低 PDF 版数（例 '1.4'）。空なら検査せず。 */
  minVersion: string;
  /** フォームフィールド残存を禁止（フラット化推奨）するか。 */
  forbidFormFields: boolean;
  /** 白紙ページを報告するか。 */
  flagBlank: boolean;
}

export interface Finding {
  id: CheckId;
  level: CheckLevel;
  /** 修復を提案する既存ツールの slug（該当なしなら null）。 */
  fixSlug: string | null;
  /** 文言に埋める数値（UI 側で整形）。 */
  detail?: {
    actualBytes?: number;
    limitBytes?: number;
    pages?: number;
    limitPages?: number;
    version?: string;
    minVersion?: string;
    formCount?: number;
    blankCount?: number;
  };
}

/** '1.7' → 1.7。読めなければ 0。 */
export function versionNumber(version: string): number {
  const m = /(\d)\.(\d)/.exec(version);
  if (!m) return 0;
  return Number(`${m[1]}.${m[2]}`);
}

/**
 * 事実と規格から検査結果を作る。常に純粋 — 同じ入力は同じ結果を返す。
 * 合否だけでなく pass も返し、UI 側でチェックリストとして描画する。
 */
export function evaluate(facts: PdfFacts, spec: CheckSpec): Finding[] {
  const findings: Finding[] = [];

  if (facts.unreadable || facts.pageCount < 0) {
    findings.push({ id: 'corrupt', level: 'fail', fixSlug: null });
    return findings;
  }

  // サイズ
  if (spec.maxBytes !== undefined) {
    const over = facts.bytes > spec.maxBytes;
    findings.push({
      id: 'size',
      level: over ? 'fail' : 'pass',
      fixSlug: over ? 'compress-pdf' : null,
      detail: { actualBytes: facts.bytes, limitBytes: spec.maxBytes },
    });
  }

  // ページ数
  if (spec.maxPages !== undefined) {
    const over = facts.pageCount > spec.maxPages;
    findings.push({
      id: 'pages',
      level: over ? 'fail' : 'pass',
      fixSlug: over ? 'extract-pages' : null,
      detail: { pages: facts.pageCount, limitPages: spec.maxPages },
    });
  }

  // バージョン（ISO 32000-1 = PDF 1.7 系。最低版数未満なら警告寄りで失敗）
  if (spec.minVersion) {
    const v = versionNumber(facts.version);
    const min = versionNumber(spec.minVersion);
    const ok = v >= min;
    findings.push({
      id: 'version',
      level: ok ? 'pass' : 'warn',
      fixSlug: ok ? null : 'compress-pdf',
      detail: { version: facts.version || '?', minVersion: spec.minVersion },
    });
  }

  // セキュリティ設定（暗号化）
  if (facts.encrypted) {
    findings.push({
      id: 'security',
      level: spec.forbidSecurity ? 'fail' : 'warn',
      fixSlug: 'unlock-pdf',
    });
  } else {
    findings.push({ id: 'security', level: 'pass', fixSlug: null });
  }

  // フォームフィールド残存
  if (facts.formFieldCount > 0) {
    findings.push({
      id: 'form',
      level: spec.forbidFormFields ? 'warn' : 'info',
      fixSlug: 'watermark-pdf',
      detail: { formCount: facts.formFieldCount },
    });
  } else {
    findings.push({ id: 'form', level: 'pass', fixSlug: null });
  }

  // 白紙ページ
  if (spec.flagBlank) {
    if (facts.blankPages.length > 0) {
      findings.push({
        id: 'blank',
        level: 'warn',
        fixSlug: 'remove-pages',
        detail: { blankCount: facts.blankPages.length },
      });
    } else {
      findings.push({ id: 'blank', level: 'pass', fixSlug: null });
    }
  }

  // スキャンのみ（参考情報。解像度は測らない）
  if (facts.scannedOnly) {
    findings.push({ id: 'scanned', level: 'info', fixSlug: 'ocr-pdf' });
  }

  return findings;
}

/** 提出先プリセット。数値のみ（文言は ja.ts 側）。 */
export interface CheckPreset extends CheckSpec {
  id: string;
  /** 1 ファイル上限バイト（null で無制限＝未検査）。 */
  maxBytes: number | undefined;
}

const MB = 1024 * 1024;

/**
 * 既知のプリセット。入管在留申請は 1 ファイル 25MB・セキュリティ設定禁止、
 * e-Tax は 1 添付 14MB、メールは一般的な 10MB 上限を目安にする。
 * （規格は変わり得るため、断定せず「目安」として UI で案内する。）
 */
export const CHECK_PRESETS: CheckPreset[] = [
  {
    id: 'immigration',
    maxBytes: 25 * MB,
    maxPages: undefined,
    forbidSecurity: true,
    minVersion: '1.4',
    forbidFormFields: true,
    flagBlank: true,
  },
  {
    id: 'etax',
    maxBytes: 14 * MB,
    maxPages: undefined,
    forbidSecurity: true,
    minVersion: '',
    forbidFormFields: false,
    flagBlank: false,
  },
  {
    id: 'email',
    maxBytes: 10 * MB,
    maxPages: undefined,
    forbidSecurity: false,
    minVersion: '',
    forbidFormFields: false,
    flagBlank: false,
  },
  {
    id: 'custom',
    maxBytes: undefined,
    maxPages: undefined,
    forbidSecurity: false,
    minVersion: '',
    forbidFormFields: false,
    flagBlank: true,
  },
];

export function getPreset(id: string): CheckPreset {
  return CHECK_PRESETS.find((preset) => preset.id === id) ?? CHECK_PRESETS[CHECK_PRESETS.length - 1];
}

/** ファイル全体の合否サマリ（UI の見出し・色に使う）。 */
export function summarize(findings: Finding[]): CheckLevel {
  if (findings.some((f) => f.level === 'fail')) return 'fail';
  if (findings.some((f) => f.level === 'warn')) return 'warn';
  return 'pass';
}
