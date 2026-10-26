import { PdfToolError } from './errors';
import {
  applySignatures,
  displayRectToPdf,
  type DisplayRect,
  type PdfPointViewport,
  type SignaturePlacement,
} from './sign-pdf';

/**
 * 押印（印鑑）方式。
 * - kiwame：一枚の印影を2ページの綴じ代（ノド）をまたいで割り、契印・割印を再現する。
 * - chain：選んだ右端の帯をページ順に分け、通し印（揃い印）を再現する。
 */
export type HankoMode = 'kiwame' | 'chain';

/** pdf.js scale-1 viewport の表示寸法（回転・CropBox・UserUnit 適用後）。 */
export interface SealPageInfo {
  width: number;
  height: number;
  /** 表示上のページ回転（0/90/180/270）。 */
  rotation: 0 | 90 | 180 | 270;
}

export interface SealGeometry {
  mode: HankoMode;
  /** 印影の横幅（PDF pt）。 */
  sealWidthPt: number;
  /** 印影の縦幅（PDF pt）。 */
  sealHeightPt: number;
  /** 印影中心の垂直位置。上端からの割合（0..1）。 */
  yFrac: number;
  /** kiwame 用：左側ページの 0 ベース index（このページと次のページの継ぎ目に押す）。 */
  seamPage?: number;
  /** kiwame 用：印影のうち左ページに乗る割合（0..1、既定 0.5）。 */
  splitFrac?: number;
  /** chain 用：全ページに分ける印影右端帯の幅（印影全幅に対する割合、既定 0.35）。 */
  stripFrac?: number;
}

/**
 * 1 枚の印影画像から切り出すべき帯と、その帯を配置する矩形。
 * rect は表示座標（左上原点・回転適用後の viewport 単位）。
 * from01 / to01 は元画像の横幅に対する水平区間（0..1）。
 */
export interface SealSliceRequest {
  /** 0 ベースのページ index。 */
  page: number;
  /** 表示座標の矩形。PDF 書き込み前に `rectToPdf` で変換する。 */
  rect: DisplayRect;
  from01: number;
  to01: number;
  /** このページの表示回転。PDF へ書き込む帯は逆方向に回して立てる。 */
  rotation: 0 | 90 | 180 | 270;
}

const EPS = 0.01;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function incompatible(): never {
  throw new PdfToolError(
    'incompatiblePages',
    'The seal cannot be aligned across the selected pages.',
  );
}

function assertFits(
  page: SealPageInfo,
  rect: DisplayRect,
  referenceHeight: number,
  yFrac: number,
): void {
  const centerFromTop = referenceHeight * yFrac;
  if (
    rect.width <= EPS ||
    rect.height <= EPS ||
    rect.x < -EPS ||
    rect.y < -EPS ||
    rect.x + rect.width > page.width + EPS ||
    rect.y + rect.height > page.height + EPS ||
    centerFromTop < rect.height / 2 - EPS ||
    centerFromTop > referenceHeight - rect.height / 2 + EPS
  ) {
    incompatible();
  }
}

/**
 * 押印レイアウトを純粋に計算する。DOM も pdf-lib も使わないので Node でテストできる。
 * 出力 rect は表示座標。PDF 変換は `applySealRequests` の converter が担当する。
 */
export function buildSealRequests(
  geom: SealGeometry,
  pages: SealPageInfo[],
): SealSliceRequest[] {
  const { sealWidthPt, sealHeightPt } = geom;
  const yFrac = clamp01(geom.yFrac);
  if (pages.length === 0) return [];
  const requests: SealSliceRequest[] = [];

  if (geom.mode === 'kiwame') {
    const p = geom.seamPage ?? 0;
    const q = p + 1;
    if (p < 0 || q >= pages.length) return requests;
    const split = clamp01(geom.splitFrac ?? 0.5);
    const [left, right] = [pages[p], pages[q]];
    // 2ページが綴じ目で物理的に揃うよう、左ページを共通の垂直基準にする。
    const y = left.height * yFrac - sealHeightPt / 2;
    const wLeft = sealWidthPt * split;
    const wRight = sealWidthPt * (1 - split);

    if (wLeft > EPS) {
      const rect = { x: left.width - wLeft, y, width: wLeft, height: sealHeightPt };
      assertFits(left, rect, left.height, yFrac);
      requests.push({
        page: p,
        rect,
        from01: 0,
        to01: split,
        rotation: left.rotation,
      });
    }
    if (wRight > EPS) {
      const rect = { x: 0, y, width: wRight, height: sealHeightPt };
      assertFits(right, rect, left.height, yFrac);
      requests.push({
        page: q,
        rect,
        from01: split,
        to01: 1,
        rotation: right.rotation,
      });
    }
    return requests;
  }

  // chain：印影の右端帯を、ページ順に重複しない水平区間へ分ける。
  // 1ページ目に帯の左端、最終ページに帯の右端が来るので、束ねて扇状に
  // 開いたとき各ページの印影がひとつの印として連なる。
  const strip = clamp01(geom.stripFrac ?? 0.35);
  const bandWidth = sealWidthPt * strip;
  const sliceWidth = bandWidth / pages.length;
  if (sliceWidth <= EPS) return requests;
  const referenceHeight = pages[0].height;
  const y = referenceHeight * yFrac - sealHeightPt / 2;
  const bandStart = 1 - strip;

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const rect = {
      x: page.width - sliceWidth,
      y,
      width: sliceWidth,
      height: sealHeightPt,
    };
    assertFits(page, rect, referenceHeight, yFrac);
    requests.push({
      page: i,
      rect,
      from01: bandStart + (i * strip) / pages.length,
      to01: bandStart + ((i + 1) * strip) / pages.length,
      rotation: page.rotation,
    });
  }
  return requests;
}

export type SealPngFactory = (request: SealSliceRequest) => Promise<Uint8Array>;
export type SealRectConverter = (rect: DisplayRect, page: number) => DisplayRect;

/**
 * リクエスト群を印影 PNG へ解決し、pdf-lib で PDF へ押し込む。
 * 帯は (from,to,rotation) 単位でキャッシュする。`rectToPdf` は呼び出し側が
 * 実際の pdf.js viewport から作り、CropBox・回転・UserUnit を一元処理する。
 */
export async function applySealRequests(
  pdfBytes: Uint8Array,
  requests: SealSliceRequest[],
  sliceToPng: SealPngFactory,
  rectToPdf: SealRectConverter,
): Promise<Uint8Array> {
  if (requests.length === 0) throw new Error('No seals to apply');
  const cache = new Map<string, Uint8Array>();
  const placements: SignaturePlacement[] = [];
  for (const req of requests) {
    const key = `${req.from01.toFixed(4)}:${req.to01.toFixed(4)}:${req.rotation}`;
    let png = cache.get(key);
    if (!png) {
      png = await sliceToPng(req);
      cache.set(key, png);
    }
    placements.push({ page: req.page, rect: rectToPdf(req.rect, req.page), png });
  }
  return applySignatures(pdfBytes, placements);
}

/** pdf.js viewport から SealRectConverter を作る小さなヘルパ。 */
export function sealRectConverter(viewports: Map<number, PdfPointViewport>): SealRectConverter {
  return (rect, page) => {
    const viewport = viewports.get(page);
    if (!viewport) throw new PdfToolError('generic', `No viewport for page ${page + 1}`);
    return displayRectToPdf(rect, viewport);
  };
}
