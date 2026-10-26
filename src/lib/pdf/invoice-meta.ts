/**
 * 電帳法（電子帳簿保存法）対応のリネーム用エンジン。テキストから 取引年月日・
 * 取引金額 を抽出し、YYYYMMDD_金額_取引先 のようなファイル名を組み立てる。
 * 取引先名は推定しない（アップロード側が既知であることが多く、誤推定は
 * 誤出力につながる）。UI 側でバッチ入力または行編集で与える。
 * ここは純粋関数のみ（DOM も pdf-lib も tesseract も使わない）なので Node で
 * テストできる。PDF からのテキスト取得と ZIP 化は呼び出し側（UI）の役割。
 */

/** 1 ファイル分の抽出結果。未確定の項目は null にして UI で確認させる。 */
export interface InvoiceMeta {
  /** YYYYMMDD（和暦は西暦に変換済み）。見つからなければ null。 */
  date: string | null;
  /** 金額（円、コンマ除去済みの整数）。見つからなければ null。 */
  amount: number | null;
  /** 取引先名。エンジンでは常に null（UI が入力する）。 */
  vendor: string | null;
}

/** 自動抽出した date / amount が未確定か（取引先はユーザー入力なので数えない）。 */
export function needsReview(meta: InvoiceMeta): boolean {
  return meta.date === null || meta.amount === null;
}

/** 全角数字・全角記号を半角に寄せる（和暦の漢字はそのまま）。 */
function normalizeWidth(s: string): string {
  return s.normalize('NFKC');
}

/**
 * YYYYMM から YYYYMMDD に落とす。日が省略された場合のみ 01 を補う。
 * 明示された日がグレゴリオ暦で成立しない（2/30、4/31、0、32…）場合は null。
 */
function ymd(year: number, month: number, day: number | null): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const d = day === null ? 1 : day;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, d));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}${pad(month)}${pad(d)}`;
}

interface Era {
  label: string;
  base: number; // 元年 = base + 1
}
const ERAS: Era[] = [
  { label: '令和', base: 2018 },
  { label: '平成', base: 1988 },
  { label: '昭和', base: 1925 },
];

/**
 * テキストから取引年月日 YYYYMMDD を拾う。ラベル付き（請求日・発行日など）を
 * 優先し、無ければ本文中の最初の日付を使う。和暦→西暦も変換する。
 * 全角数字と「元年」にも対応する。
 */
export function parseDate(text: string): string | null {
  const normalized = normalizeWidth(text).replace(/[ 　]/g, '');
  // 1) ラベル直後の日付を優先
  const labeled =
    /(?:発行日|発効日|請求日|御?請求日|納品日|交付日|交易日|作成日|記入日|Date|Invoice\s*Date)[：:]?\s*([^\s、。）)]{6,20})/i.exec(
      normalized,
    );
  const candidate = labeled ? labeled[1] : normalized;

  // 2) 和暦（令和/平成/昭和 + 年 + 月 + 日）。元年にも対応。
  for (const era of ERAS) {
    const m = new RegExp(`${era.label}?(元|\\d{1,2})年(\\d{1,2})月(?:(\\d{1,2})日)?`).exec(candidate);
    if (m && candidate.includes(era.label)) {
      const year = era.base + (m[1] === '元' ? 1 : Number(m[1]));
      const out = ymd(year, Number(m[2]), m[3] ? Number(m[3]) : null);
      if (out) return out;
    }
  }
  // 3) 西暦 YYYY/M/D または YYYY年M月D日
  const western = /((?:19|20)\d{2})\s*[/\-年.]\s*(\d{1,2})\s*[/\-月.]\s*(\d{1,2})?/.exec(candidate);
  if (western) {
    const out = ymd(Number(western[1]), Number(western[2]), western[3] ? Number(western[3]) : null);
    if (out) return out;
  }
  // 4) 本文に和暦が混在する場合は総ざらい
  for (const era of ERAS) {
    const m = new RegExp(`${era.label}(元|\\d{1,2})年(\\d{1,2})月(?:(\\d{1,2})日)?`).exec(normalized);
    if (m) {
      const out = ymd(era.base + (m[1] === '元' ? 1 : Number(m[1])), Number(m[2]), m[3] ? Number(m[3]) : null);
      if (out) return out;
    }
  }
  return null;
}

/** "1,234,560" 形式の数字列を整数に。 */
function toInt(digits: string): number {
  return Number(digits.replace(/[, 　]/g, ''));
}

const MAX_AMOUNT = 100_000_000_000;

/** 番号・No. など金額でない数字列をラベルごと除去する（請求書番号：20251025 対策）。 */
const NUMBER_LABEL_RE =
  /(?:請求書番号|請求番号|発行番号|管理番号|登録番号|書類番号|受付番号|番号|ナンバー|invoice\s*(?:no\.?|number)|\bno\.?)\s*[：:]?\s*[a-z0-9\-‐‑‒–—―ー]*\d[a-z0-9\-‐‑‒–—―ー]*/gi;

/** 強い合計ラベル（税込・合計・請求金額など）。Subtotal は除外する。 */
const STRONG_LABEL_RE =
  /(?:税込(?:み)?|消費税込(?:み)?|総合計|総額|合計金額|合計|ご請求金額|御請求金額|請求金額|ご請求額|御請求額|請求額|お支払(?:い)?金額|お支払(?:い)?額|支払金額|支払総額|今回(?:の)?(?:ご請求|お支払)(?:金額|額)?|grand\s*total|invoice\s*total|amount\s*due|(?<!sub)(?<!sub\s)total)\s*[：:]?\s*[¥￥]?\s*(\d{1,3}(?:,\d{3})+|\d{1,12})\s*円?/gi;

/** 弱いラベル（請求・小計・金額）。「請求書番号」の請求は NUMBER_LABEL_RE で除去済み。 */
const WEAK_LABEL_RE =
  /(?:ご請求|御請求|請求|小計|金額|subtotal|amount)\s*[：:]?\s*[¥￥]?\s*(\d{1,3}(?:,\d{3})+|\d{1,12})\s*円?/gi;

/** ¥/円 が付いた無ラベルの金額。 */
const MARKED_AMOUNT_RE = /[¥￥]\s*(\d{1,3}(?:,\d{3})+|\d{1,12})|(\d{1,3}(?:,\d{3})+|\d{1,12})\s*円/g;

function collectMatches(re: RegExp, text: string, group: number): number[] {
  const hits: number[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[group];
    if (!raw) continue;
    const v = toInt(raw);
    if (v > 0 && v < MAX_AMOUNT) hits.push(v);
  }
  return hits;
}

/**
 * テキストから取引金額（円）を拾う。優先度は 強いラベル > 弱いラベル >
 * ¥/円 付き > コンマ区切りの大きな数字 で、同じ優先度内では最大値を総額とみなす。
 * 請求書番号などの識別番号はあらかじめ除去し、金額と誤認しない。
 */
export function parseAmount(text: string): number | null {
  const normalized = normalizeWidth(text);
  const body = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(NUMBER_LABEL_RE, ''))
    .join('\n');

  const strong = collectMatches(STRONG_LABEL_RE, body, 1);
  if (strong.length > 0) return Math.max(...strong);
  const weak = collectMatches(WEAK_LABEL_RE, body, 1);
  if (weak.length > 0) return Math.max(...weak);
  const marked = [
    ...collectMatches(MARKED_AMOUNT_RE, body, 1),
    ...collectMatches(MARKED_AMOUNT_RE, body, 2),
  ];
  if (marked.length > 0) return Math.max(...marked);
  const bare = body.match(/\d{1,3}(?:,\d{3})+/g);
  if (bare) {
    const vals = bare.map(toInt).filter((v) => v >= 1000 && v < MAX_AMOUNT);
    if (vals.length > 0) return Math.max(...vals);
  }
  return null;
}

/** テキストから日付と金額を抽出する。取引先は推定せず null のまま返す。 */
export function parseInvoiceMeta(text: string): InvoiceMeta {
  return {
    date: parseDate(text),
    amount: parseAmount(text),
    vendor: null,
  };
}

/** YYYYMMDD を表示用 YYYY/MM/DD に。null は空表示。 */
export function formatDateForDisplay(ymdStr: string | null): string {
  if (!ymdStr || ymdStr.length !== 8) return ymdStr ?? '';
  return `${ymdStr.slice(0, 4)}/${ymdStr.slice(4, 6)}/${ymdStr.slice(6, 8)}`;
}

/** ファイル名に使えない文字を削り、空白・区切りを詰める。日本語は残す。 */
export function sanitizeForFilename(input: string): string {
  return input
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '') // Windows 予約字
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '') // 先頭末尾のドット・空白
    .trim();
}

/**
 * テンプレートからファイル名（拡張子無し）を組み立てる。トークンは
 * {{date}} {{amount}} {{vendor}} {{original}}。未確定トークンは空になり、
 * 直後に続く '_' を詰める。すべて空なら原文件名を使う。
 */
export function renderInvoiceName(
  template: string,
  meta: InvoiceMeta,
  originalBase: string,
): string {
  const map: Record<string, string> = {
    date: meta.date ?? '',
    amount: meta.amount !== null ? String(meta.amount) : '',
    vendor: meta.vendor ? sanitizeForFilename(meta.vendor) : '',
    original: sanitizeForFilename(originalBase),
  };
  let name = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? '');
  // 空トークンで出来た連続区切り・前後の区切りを掃除
  name = name.replace(/[_\-\s]{2,}/g, '_').replace(/^[_\-\s]+|[_\-\s]+$/g, '');
  name = sanitizeForFilename(name);
  if (!name) name = map.original || 'invoice';
  return name;
}

/** Windows のデバイス予約名（拡張子を付けても衝突する）。 */
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 同一ファイル名衝突に連番を付ける（純粋）。生成した連番候補も使用済み集合に
 * 登録して再衝突を防ぐ（a, a, a_2 → a, a_2, a_2_2）。大文字小文字は Windows
 * に合わせて区別しない。デバイス予約名は先頭に '_' を付けて回避する。
 * 拡張子は呼び出し側で後付けするため name は本体のみ。
 */
export function dedupeNames(bases: string[]): string[] {
  const used = new Set<string>();
  return bases.map((base) => {
    const safe = WINDOWS_RESERVED_RE.test(base) ? `_${base}` : base;
    let candidate = safe;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${safe}_${n}`;
      n += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

/**
 * CSV の一セルを RFC4180 に従いエスケープ。先頭の空白・制御文字の直後に
 * = + - @ が来る値はスプレッドシートが数式として実行するため、' を前置して
 * 無効化する（数式インジェクション対策）。
 */
export function csvCell(value: string): string {
  const neutralized = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(neutralized) ? `"${neutralized.replace(/"/g, '""')}"` : neutralized;
}
