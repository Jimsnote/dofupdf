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

/** YYYYMM から YYYYMMDD に落とす（日が無ければ 01）。-invalid は null。 */
function ymd(year: number, month: number, day: number | null): string | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2999) return null;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  const d = day && day >= 1 && day <= 31 ? day : 1;
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
 */
export function parseDate(text: string): string | null {
  const normalized = text.replace(/[  \u3000]/g, '');
  // 1) ラベル直後の日付を優先
  const labeled =
    /(?:発行日|発効日|請求日|御?請求日|納品日|交付日|交易日|作成日|記入日|Date|Invoice\s*Date)[：:]?\s*([^\s、。）)]{6,20})/i.exec(
      normalized,
    );
  const candidate = labeled ? labeled[1] : normalized;

  // 2) 和暦（令和/平成/昭和 + 年 + 月 + 日）
  for (const era of ERAS) {
    const m = new RegExp(`${era.label}?(\\d{1,2})年(\\d{1,2})月(?:(\\d{1,2})日)?`).exec(candidate);
    if (m && candidate.includes(era.label)) {
      const year = era.base + Number(m[1]);
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
    const m = new RegExp(`${era.label}(\\d{1,2})年(\\d{1,2})月(?:(\\d{1,2})日)?`).exec(normalized);
    if (m) {
      const out = ymd(era.base + Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null);
      if (out) return out;
    }
  }
  return null;
}

/** "1,234,560" 形式の数字列を整数に。 */
function toInt(digits: string): number {
  return Number(digits.replace(/[,\u3000 ]/g, ''));
}

/**
 * テキストから取引金額（円）を拾う。税込・合計・請求金額などのラベル直後の
 * 金額を優先し、無ければ最も大きなコンマ区切り数字を採用する。
 */
export function parseAmount(text: string): number | null {
  const normalized = text.replace(/\u3000/g, ' ');
  const labelRe =
    /(?:税込|税金込み|消費税込み|総額|合計金額|合計|御?請求金額|御?請求額|請求合計|お?支払金額|支払総額|ご請求|請求|Subtotal|Total|Amount|Inv(?:oice)?\s*Total)[^\d]{0,10}(\d{1,3}(?:,\d{3})+|\d{4,})\s*円?/gi;
  const hits: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(normalized)) !== null) {
    const v = toInt(m[1]);
    if (v > 0 && v < 100_000_000_000) hits.push(v);
  }
  if (hits.length > 0) {
    // 税込/合計は末尾側に出やすい。最大のものを総額とみなす。
    return Math.max(...hits);
  }
  // ラベル無しフォールバック：コンマ付きの金額らしき数字の最大値
  const bare = normalized.match(/\d{1,3}(?:,\d{3})+/g);
  if (bare) {
    const vals = bare.map(toInt).filter((v) => v >= 1000);
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

/**
 * 同一ファイル名衝突に連番を付ける（純粋）。受け取った name セットを書き換えつつ
 * 各 index の一意名を返す。拡張子は呼び出し側で後付けするため name は本体のみ。
 */
export function dedupeNames(bases: string[]): string[] {
  const used = new Map<string, number>();
  return bases.map((base) => {
    const seen = used.get(base);
    if (seen === undefined) {
      used.set(base, 1);
      return base;
    }
    used.set(base, seen + 1);
    return `${base}_${seen + 1}`;
  });
}
