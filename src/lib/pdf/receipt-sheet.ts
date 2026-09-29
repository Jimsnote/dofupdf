import type {
  PDFDocument as SourceDocument,
  PDFEmbeddedPage,
  PDFPage as SourcePage,
} from '@cantoo/pdf-lib';
import { PdfToolError } from './errors';
import { getPdfLib } from './pdf-lib';

/** How many receipt pages are placed on one A4 sheet. */
export type ItemsPerPage = 1 | 2 | 3 | 4 | 6 | 9;

export interface ReceiptSheetOptions {
  perPage: ItemsPerPage;
  /** Outer margin on all four sides, in millimetres. */
  marginMm: number;
  /** Extra margin added to the left for hole-punch binding, in millimetres. */
  bindingMm: number;
  /** Turn a page by 90° when that lets it fill its cell better. */
  autoRotate: boolean;
  /** Draw a thin dashed frame around every placed page (cut / paste guide). */
  guideLines: boolean;
}

/** A4 portrait, in millimetres. */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
/** PostScript points per millimetre (72 pt per 25.4 mm). */
const MM = 72 / 25.4;
/** White space kept between two neighbouring cells. */
const GAP_MM = 3;
/** Every page of every input becomes one item; this is the total cap. */
const MAX_ITEMS = 100;

/** Column/row split for each "per sheet" choice, in reading order. */
const GRIDS: Record<ItemsPerPage, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 1, rows: 2 },
  3: { cols: 1, rows: 3 },
  4: { cols: 2, rows: 2 },
  6: { cols: 2, rows: 3 },
  9: { cols: 3, rows: 3 },
};

/** The measured shape of one source page, in points. */
export interface PageMeasure {
  width: number;
  height: number;
  /** The page's /Rotate, normalised to 0, 90, 180 or 270. */
  rotation: number;
}

/** Where one page ends up on which sheet — the pure part of the layout. */
export interface Placement {
  sheetIndex: number;
  col: number;
  row: number;
  /** Total rotation applied when drawing, in pdf-lib's counterclockwise sense. */
  angle: number;
  /** Footprint of the drawn page in the page's own, unrotated space. */
  width: number;
  height: number;
  /** Center of the drawn page, in sheet coordinates (origin: bottom-left). */
  centerX: number;
  centerY: number;
  /** Axis-aligned bounding box on the sheet — what a guide line would trace. */
  boxWidth: number;
  boxHeight: number;
}

/** Keeps a stray value (or a NaN from a broken number input) on the grid. */
export function normalizePerPage(value: number): ItemsPerPage {
  const allowed: ItemsPerPage[] = [1, 2, 3, 4, 6, 9];
  return allowed.includes(value as ItemsPerPage) ? (value as ItemsPerPage) : 2;
}

/**
 * Reads the shape of every page of an already loaded document: the box pdf-lib
 * will embed (the MediaBox, which knows nothing about /Rotate) plus the page's
 * own rotation normalised to 0, 90, 180 or 270.
 *
 * Shared by the layout and by the live preview, so the picture the user sees is
 * computed from the same numbers the download is built from.
 */
export function measureDocumentPages(doc: SourceDocument): PageMeasure[] {
  return doc.getPages().map((page) => {
    const { width, height } = page.getSize();
    const angle = page.getRotation().angle;
    return { width, height, rotation: ((Math.round(angle) % 360) + 360) % 360 };
  });
}

export interface SheetGeometry {
  pageWidth: number;
  pageHeight: number;
  cols: number;
  rows: number;
  perPage: number;
  cellWidth: number;
  cellHeight: number;
  /** Left inner edge of the printable area, including the binding margin. */
  contentLeft: number;
  /** Right, top and bottom inner edges share the plain margin. */
  contentRight: number;
}

/** One grid cell, in points. `top` is measured from the page's bottom edge. */
export interface SheetCell {
  col: number;
  row: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function sheetGeometry(options: ReceiptSheetOptions): SheetGeometry {
  const grid = GRIDS[normalizePerPage(options.perPage)];
  const pageWidth = A4_WIDTH_MM * MM;
  const pageHeight = A4_HEIGHT_MM * MM;
  const side = Math.max(0, options.marginMm) * MM;
  const left = side + Math.max(0, options.bindingMm) * MM;
  const gap = GAP_MM * MM;
  return {
    pageWidth,
    pageHeight,
    cols: grid.cols,
    rows: grid.rows,
    perPage: grid.cols * grid.rows,
    cellWidth: (pageWidth - left - side - (grid.cols - 1) * gap) / grid.cols,
    cellHeight: (pageHeight - side * 2 - (grid.rows - 1) * gap) / grid.rows,
    contentLeft: left,
    contentRight: pageWidth - side,
  };
}

/**
 * The cells of one sheet, in the order pages are placed into them: left to
 * right, top row first. The layout writes into these and the live preview draws
 * them, so the picture can never drift from what gets printed.
 */
export function sheetCells(options: ReceiptSheetOptions): SheetCell[] {
  const geometry = sheetGeometry(options);
  const gap = GAP_MM * MM;
  const side = Math.max(0, options.marginMm) * MM;
  const cells: SheetCell[] = [];
  for (let row = 0; row < geometry.rows; row += 1) {
    for (let col = 0; col < geometry.cols; col += 1) {
      cells.push({
        col,
        row,
        left: geometry.contentLeft + col * (geometry.cellWidth + gap),
        top: geometry.pageHeight - (side + row * (geometry.cellHeight + gap)),
        width: geometry.cellWidth,
        height: geometry.cellHeight,
      });
    }
  }
  return cells;
}

/**
 * Assigns every measured page to a cell, scaled to fit it.
 *
 * A page is never cropped and never distorted: it is scaled by the largest
 * factor that keeps it inside the cell and then centered. When `autoRotate` is
 * on, a page is additionally turned by 90° if — and only if, by a margin of 5%
 * — that lets it fill the cell better, so a wide statement lands sideways in a
 * tall cell while a near-square slip keeps the orientation its sender chose.
 */
export function computePlacements(
  measures: PageMeasure[],
  options: ReceiptSheetOptions,
): Placement[] {
  const geometry = sheetGeometry(options);
  const cells = sheetCells(options);
  const placements: Placement[] = [];

  measures.forEach((measure, index) => {
    const slot = index % geometry.perPage;
    const cell = cells[slot]!;
    const col = cell.col;
    // Rows are counted from the top of the sheet, while PDF coordinates count
    // from its bottom.
    const row = cell.row;
    const cellX = cell.left;
    const cellY = cell.top;
    const centerX = cellX + cell.width / 2;
    const centerY = cellY - cell.height / 2;

    // Size the page occupies once its own /Rotate is taken into account.
    const flipped = measure.rotation === 90 || measure.rotation === 270;
    let boxWidth = flipped ? measure.height : measure.width;
    let boxHeight = flipped ? measure.width : measure.height;

    // `/Rotate` is a *clockwise* rotation applied by the viewer, while the angle
    // handed to `drawPage` turns content *counterclockwise*. The sign is
    // therefore flipped here: keeping it as-is would land a page scanned with
    // /Rotate 90 upside down on the sheet (verified against Chrome's viewer).
    let angle = (360 - measure.rotation) % 360;
    const straight = Math.min(cell.width / boxWidth, cell.height / boxHeight);
    if (options.autoRotate) {
      const turned = Math.min(cell.width / boxHeight, cell.height / boxWidth);
      if (turned > straight * 1.05) {
        angle = (angle + 90) % 360;
        [boxWidth, boxHeight] = [boxHeight, boxWidth];
      }
    }
    const scale = Math.min(cell.width / boxWidth, cell.height / boxHeight);

    placements.push({
      sheetIndex: Math.floor(index / geometry.perPage),
      col,
      row,
      angle,
      width: measure.width * scale,
      height: measure.height * scale,
      centerX,
      centerY,
      boxWidth: boxWidth * scale,
      boxHeight: boxHeight * scale,
    });
  });

  return placements;
}

/**
 * Places one receipt per page (not per file) of the input documents onto A4
 * sheets, in the order the files were given.
 *
 * pdf-lib's page embedding copies a page's MediaBox and deliberately ignores
 * /Rotate, so the source rotation is read here and re-applied when drawing —
 * otherwise a scanned receipt stored as landscape-with-/Rotate-90 would land on
 * the sheet in the wrong orientation. Re-applying means a clockwise turn, see
 * `computePlacements`.
 */
export async function layoutReceiptsOnA4(
  inputs: Uint8Array[],
  options: ReceiptSheetOptions,
): Promise<Uint8Array> {
  const { PDFDocument, degrees, rgb, pushGraphicsState, popGraphicsState } = await getPdfLib();

  // First pass: measure every page. The documents stay loaded, because
  // `embedPdf` accepts one and that saves parsing each file twice.
  const sources: SourceDocument[] = [];
  const items: { docIndex: number; pageIndex: number; measure: PageMeasure }[] = [];
  for (const bytes of inputs) {
    const doc = await PDFDocument.load(bytes);
    const docIndex = sources.length;
    sources.push(doc);
    measureDocumentPages(doc).forEach((measure, pageIndex) => {
      items.push({ docIndex, pageIndex, measure });
    });
  }
  if (items.length === 0) {
    throw new PdfToolError('noPages', 'No pages to place');
  }
  if (items.length > MAX_ITEMS) {
    throw new PdfToolError('tooManyPages', String(MAX_ITEMS));
  }

  // A page can only be turned into a form XObject if it has a content stream.
  // A blank page — the kind an editor leaves behind — has none, and pdf-lib
  // reports that only while the document is being written, which would fail the
  // whole job because of one empty page. Give those pages an empty but valid
  // stream up front: they stay blank on the sheet, exactly as they are in the
  // source file. The check mirrors `PDFPageEmbedder`'s own condition.
  for (const doc of sources) {
    for (const page of doc.getPages()) {
      try {
        if (!page.node.normalizedEntries().Contents) {
          page.pushOperators(pushGraphicsState(), popGraphicsState());
        }
      } catch {
        // An unreadable page entry is left untouched; the real failure, if any,
        // surfaces later with a proper error instead of being guessed at here.
      }
    }
  }

  // Embedding all pages of a document in one call keeps them sharing one object
  // copier, so fonts and images referenced by several pages are copied once.
  const target = await PDFDocument.create();
  const embedded: PDFEmbeddedPage[][] = [];
  for (const doc of sources) {
    embedded.push(await target.embedPdf(doc, doc.getPageIndices()));
  }

  const placements = computePlacements(
    items.map((item) => item.measure),
    options,
  );
  const geometry = sheetGeometry(options);

  let sheet: SourcePage | null = null;
  let currentSheet = -1;
  const guideColor = rgb(0.72, 0.72, 0.72);

  placements.forEach((placement, index) => {
    if (placement.sheetIndex !== currentSheet) {
      currentSheet = placement.sheetIndex;
      sheet = target.addPage([geometry.pageWidth, geometry.pageHeight]);
    }
    const page = sheet!;
    const item = items[index]!;

    // drawPage applies translate → rotate → scale, i.e. it rotates about the
    // (x, y) origin, so the origin is solved backwards from the desired center.
    const radians = (placement.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    page.drawPage(embedded[item.docIndex]![item.pageIndex]!, {
      x: placement.centerX - (placement.width / 2) * cos + (placement.height / 2) * sin,
      y: placement.centerY - (placement.width / 2) * sin - (placement.height / 2) * cos,
      width: placement.width,
      height: placement.height,
      rotate: degrees(placement.angle),
    });

    if (options.guideLines) {
      // The axis-aligned bounding box is the outline a user would cut or paste
      // along, so that is what the guide traces.
      page.drawRectangle({
        x: placement.centerX - placement.boxWidth / 2,
        y: placement.centerY - placement.boxHeight / 2,
        width: placement.boxWidth,
        height: placement.boxHeight,
        borderWidth: 0.5,
        borderColor: guideColor,
        borderDashArray: [2, 2],
      });
    }
  });

  return target.save();
}
