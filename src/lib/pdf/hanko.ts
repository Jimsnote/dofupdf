import { applySignatures, type SignaturePlacement } from './sign-pdf';

/**
 * 押印（印鑑）方式。
 * - kiwame：一枚の印影を2ページの綴じ代（ノド）をまたいで割り、契印・割印を再現する。
 * - chain：印影の右端の細片を全ページの右端に同じ位置で重ね、通し印（揃い印）を再現する。
 */
export type HankoMode = 'kiwame' | 'chain';

/** ページの MediaBox サイズ（回転込みの実寸、PDF pt・原点は左下ではない＝幅/高さのみ）。 */
export interface PageSizePt {
  width: number;
  height: number;
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
  /** chain 用：各ページの右端に見せる細片の幅（印影全幅に対する割合、既定 0.35）。 */
  stripFrac?: number;
}

/**
 * 1 枚の印影画像から切り出すべき帯と、その帯を配置する矩形。
 * from01 / to01 は元画像の横幅に対する水平区間（0..1）。
 */
export interface SealSliceRequest {
  /** 0 ベースのページ index。 */
  page: number;
  /** PDF pt・原点左下の矩形（pdf-lib の drawImage 用の座標系）。 */
  rect: { x: number; y: number; width: number; height: number };
  from01: number;
  to01: number;
}

const EPS = 0.01;

/**
 * 押印レイアウトを純粋に計算する。DOM も pdf-lib も使わないので Node でテストできる。
 * sizes は pdf-lib の `page.getSize()`（実寸・pt）と同一座標系を想定する。
 */
export function buildSealRequests(geom: SealGeometry, sizes: PageSizePt[]): SealSliceRequest[] {
  const { sealWidthPt, sealHeightPt, yFrac } = geom;
  // 上端からの中心割合 yFrac を、原点左下の y（矩形上端ではなく下端）に変換する。
  const yBottomFor = (height: number) => height * (1 - yFrac) - sealHeightPt / 2;
  const requests: SealSliceRequest[] = [];

  if (geom.mode === 'kiwame') {
    const p = geom.seamPage ?? 0;
    const q = p + 1;
    if (p < 0 || q >= sizes.length) return requests;
    const split = geom.splitFrac ?? 0.5;
    const [a, b] = [sizes[p], sizes[q]];
    const wLeft = sealWidthPt * split;
    const wRight = sealWidthPt * (1 - split);
    if (wLeft > EPS) {
      requests.push({
        page: p,
        rect: { x: a.width - wLeft, y: yBottomFor(a.height), width: wLeft, height: sealHeightPt },
        from01: 0,
        to01: split,
      });
    }
    if (wRight > EPS) {
      requests.push({
        page: q,
        rect: { x: 0, y: yBottomFor(b.height), width: wRight, height: sealHeightPt },
        from01: split,
        to01: 1,
      });
    }
    return requests;
  }

  // chain：全ページ右端に同じ細片（印影の右側 part）を置く。
  const strip = geom.stripFrac ?? 0.35;
  const wStrip = sealWidthPt * strip;
  if (wStrip <= EPS) return requests;
  for (let i = 0; i < sizes.length; i += 1) {
    const s = sizes[i];
    requests.push({
      page: i,
      rect: { x: s.width - wStrip, y: yBottomFor(s.height), width: wStrip, height: sealHeightPt },
      from01: 1 - strip,
      to01: 1,
    });
  }
  return requests;
}

/**
 * リクエスト群を、印影画像の水平帯を切り出すコールバックと組み合わせて
 *実際の PNG バイトに解決し、pdf-lib で PDF へ押し込む。スライス結果は
 * [from01,to01] 単位でキャッシュする（chain では全ページ同じ帯を使う）。
 */
export async function applySealRequests(
  pdfBytes: Uint8Array,
  requests: SealSliceRequest[],
  sliceToPng: (from01: number, to01: number) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (requests.length === 0) throw new Error('No seals to apply');
  const cache = new Map<string, Uint8Array>();
  const placements: SignaturePlacement[] = [];
  for (const req of requests) {
    const key = `${req.from01.toFixed(3)}:${req.to01.toFixed(3)}`;
    let png = cache.get(key);
    if (!png) {
      png = await sliceToPng(req.from01, req.to01);
      cache.set(key, png);
    }
    placements.push({ page: req.page, rect: req.rect, png });
  }
  return applySignatures(pdfBytes, placements);
}
