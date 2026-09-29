'use client';

import type { Dictionary } from '@/i18n/locales/ja';
import {
  computePlacements,
  sheetCells,
  sheetGeometry,
  type PageMeasure,
  type ReceiptSheetOptions,
} from '@/lib/pdf/receipt-sheet';

interface ReceiptSheetPreviewProps {
  dict: Dictionary;
  options: ReceiptSheetOptions;
  /** Pages measured from the added files, or null while they are being read. */
  measures: PageMeasure[] | null;
  hasFiles: boolean;
}

const PT_PER_MM = 72 / 25.4;

/**
 * Shapes shown before any file is added, so the four choices can be explored
 * right away: a full A4 slip, a landscape scan (a portrait box carrying
 * /Rotate 90), a narrow receipt, and a B5 statement. They are labelled as a
 * sample under the picture, and are replaced by the real page sizes as soon as
 * files arrive.
 */
const DEMO_MEASURES: PageMeasure[] = [
  { width: 210 * PT_PER_MM, height: 297 * PT_PER_MM, rotation: 0 },
  { width: 210 * PT_PER_MM, height: 297 * PT_PER_MM, rotation: 90 },
  { width: 80 * PT_PER_MM, height: 200 * PT_PER_MM, rotation: 0 },
  { width: 182 * PT_PER_MM, height: 257 * PT_PER_MM, rotation: 0 },
];

/**
 * What the first sheet will look like — drawn from the same geometry functions
 * the layout uses, so the preview cannot disagree with the downloaded PDF.
 */
export function ReceiptSheetPreview({ dict, options, measures, hasFiles }: ReceiptSheetPreviewProps) {
  const copy = dict.toolPages['receipt-sheet'];
  const geometry = sheetGeometry(options);
  const cells = sheetCells(options);

  const isDemo = !hasFiles;
  const sources = isDemo
    ? Array.from({ length: geometry.perPage }, (_, index) => DEMO_MEASURES[index % DEMO_MEASURES.length]!)
    : (measures ?? []);
  const placements = computePlacements(sources.slice(0, geometry.perPage), options);

  const margin = geometry.pageWidth - geometry.contentRight;
  const binding = options.bindingMm;

  // While the pages are still being read the grid is drawn empty; naming its
  // capacity beats announcing "0 sheets" to a screen reader.
  const aria = copy.previewAria
    .replace('{cols}', String(geometry.cols))
    .replace('{rows}', String(geometry.rows))
    .replace('{items}', String(placements.length > 0 ? placements.length : geometry.perPage));

  return (
    <figure className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <figcaption className="text-sm font-semibold text-slate-900">{copy.previewHeading}</figcaption>

      <svg
        viewBox={`0 0 ${geometry.pageWidth} ${geometry.pageHeight}`}
        role="img"
        aria-label={aria}
        className="mt-3 block h-auto w-full max-w-[230px] border border-slate-300 bg-white"
      >
        {binding > 0 ? (
          <rect
            x={margin}
            y={0}
            width={geometry.contentLeft - margin}
            height={geometry.pageHeight}
            fill="#e2e8f0"
          />
        ) : null}

        {cells.map((cell) => (
          <rect
            key={`${cell.row}-${cell.col}`}
            x={cell.left}
            y={geometry.pageHeight - cell.top}
            width={cell.width}
            height={cell.height}
            fill="none"
            stroke="#cbd5e1"
            strokeDasharray="6 6"
            strokeWidth={1}
          />
        ))}

        {placements.map((placement, index) => (
          <g
            key={`item-${index}`}
            transform={`translate(${placement.centerX} ${geometry.pageHeight - placement.centerY}) rotate(${placement.angle})`}
          >
            <rect
              x={-placement.width / 2}
              y={-placement.height / 2}
              width={placement.width}
              height={placement.height}
              fill="#c7d2fe"
              stroke="#4f46e5"
              strokeWidth={2}
            />
          </g>
        ))}

        {options.guideLines
          ? placements.map((placement, index) => (
              <rect
                key={`guide-${index}`}
                x={placement.centerX - placement.boxWidth / 2}
                y={geometry.pageHeight - placement.centerY - placement.boxHeight / 2}
                width={placement.boxWidth}
                height={placement.boxHeight}
                fill="none"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={1.5}
              />
            ))
          : null}
      </svg>

      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {isDemo
          ? copy.previewDemo
          : measures === null
            ? copy.previewLoading
            : copy.previewReal}
      </p>
      {binding > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          {copy.previewBindingNote.replace('{mm}', String(binding))}
        </p>
      ) : null}
    </figure>
  );
}
