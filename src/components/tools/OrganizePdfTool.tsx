'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle2,
  FileText,
  Loader2,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { organizePdf } from '@/lib/pdf/organize';
import { warmPdfLib } from '@/lib/pdf/pdf-lib';
import { loadPdfJsDocument, renderThumbnail, type PdfJsDocument } from '@/lib/pdf/pdfjs';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface OrganizePdfToolProps {
  dict: Dictionary;
  /** Preset variant of the shared organizer UI (remove/extract/reorder pages). */
  preset?: OrganizePreset;
}

export type OrganizePreset = 'organize' | 'remove' | 'extract' | 'reorder';

/** Maps each preset to its localized copy entry and output file name. */
const PRESET_CONFIG: Record<
  OrganizePreset,
  { copySlug: 'organize-pdf' | 'remove-pages' | 'extract-pages' | 'reorder-pages'; outputName: string }
> = {
  organize: { copySlug: 'organize-pdf', outputName: 'organized.pdf' },
  remove: { copySlug: 'remove-pages', outputName: 'removed.pdf' },
  extract: { copySlug: 'extract-pages', outputName: 'extracted.pdf' },
  reorder: { copySlug: 'reorder-pages', outputName: 'reordered.pdf' },
};

type PageRotation = 0 | 90 | 180 | 270;

interface PageItem {
  /** Stable id for dnd-kit (equal to the original page index). */
  id: number;
  /** 0-based page index in the source document. */
  sourceIndex: number;
  /** Extra rotation applied on top of the page's own orientation. */
  rotation: PageRotation;
  deleted: boolean;
  selected: boolean;
  /** JPEG data URL, rendered with the current total rotation. */
  thumb: string | null;
}

interface Result {
  name: string;
  size: number;
  url: string;
  blob: Blob;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
/** Rendered thumbnail width in pixels (displayed at roughly half that). */
const THUMB_WIDTH = 320;
/** Pages previewed on load; further pages render via "load more". */
const INITIAL_THUMB_COUNT = 30;
const LOAD_MORE_STEP = 60;

type OrganizeCopy = Dictionary['toolPages']['organize-pdf'];

interface SortablePageCardProps {
  item: PageItem;
  copy: OrganizeCopy;
  busy: boolean;
  onToggleSelect: (index: number) => void;
  onRotate: (index: number) => void;
  onToggleDelete: (index: number) => void;
}

function SortablePageCard({
  item,
  copy,
  busy,
  onToggleSelect,
  onRotate,
  onToggleDelete,
}: SortablePageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const pageLabel = copy.pageLabel.replace('{n}', String(item.sourceIndex + 1));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`relative touch-manipulation select-none rounded-lg border bg-white p-2 shadow-sm ${
        isDragging ? 'z-10 opacity-90 shadow-lg' : ''
      } ${item.selected ? 'border-brand-500 ring-2 ring-brand-500' : 'border-slate-200'} ${
        busy ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggleSelect(item.id)}
        disabled={busy || item.deleted}
        aria-pressed={item.selected}
        aria-label={pageLabel}
        className="block w-full disabled:cursor-not-allowed"
      >
        <span className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-slate-100">
          {item.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URLs from canvas, no next/image optimization possible
            <img
              src={item.thumb}
              alt={pageLabel}
              draggable={false}
              className={`max-h-full max-w-full ${item.deleted ? 'opacity-40 grayscale' : ''}`}
            />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
          )}
          {item.selected ? (
            <CheckCircle2
              className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white text-brand-600"
              aria-hidden
            />
          ) : null}
          {item.deleted ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded bg-red-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                {copy.deletedBadge}
              </span>
            </span>
          ) : null}
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
          {pageLabel}
        </span>
        <span className="flex">
          <button
            type="button"
            aria-label={`${copy.rotatePage}: ${pageLabel}`}
            disabled={busy}
            onClick={() => onRotate(item.id)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700 disabled:opacity-30"
          >
            <RotateCw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`${item.deleted ? copy.restorePage : copy.deletePage}: ${pageLabel}`}
            disabled={busy}
            onClick={() => onToggleDelete(item.id)}
            className={`rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 ${
              item.deleted ? 'hover:text-brand-700' : 'hover:text-red-600'
            }`}
          >
            {item.deleted ? (
              <Undo2 className="h-4 w-4" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
          </button>
        </span>
      </div>
    </div>
  );
}

export function OrganizePdfTool({ dict, preset = 'organize' }: OrganizePdfToolProps) {
  const ui = dict.toolUi;
  const { copySlug, outputName } = PRESET_CONFIG[preset];
  const copy = dict.toolPages[copySlug];
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_THUMB_COUNT);
  const [docReady, setDocReady] = useState(0);
  const [renderingThumbs, setRenderingThumbs] = useState(false);
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const docRef = useRef<PdfJsDocument | null>(null);
  const pagesRef = useRef<PageItem[]>([]);
  const sessionRef = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMaxSizeBytes(MOBILE_MAX_BYTES);
    }
  }, []);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  // Destroy the pdf.js document when the component unmounts.
  useEffect(() => () => void docRef.current?.destroy(), []);

  // Render missing thumbnails for the currently visible slice, one at a time.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || docReady === 0) return undefined;
    const limit = Math.min(visibleCount, pages.length);
    let hasMissing = false;
    for (let i = 0; i < limit; i += 1) {
      if (!pages[i].thumb) {
        hasMissing = true;
        break;
      }
    }
    if (!hasMissing) return undefined;
    const session = sessionRef.current;
    let cancelled = false;
    setRenderingThumbs(true);
    void (async () => {
      for (let i = 0; i < limit; i += 1) {
        if (cancelled || sessionRef.current !== session) return;
        const item = pagesRef.current[i];
        if (!item || item.thumb) continue;
        try {
          const url = await renderThumbnail(doc.doc, item.sourceIndex + 1, item.rotation, THUMB_WIDTH);
          if (cancelled || sessionRef.current !== session) return;
          setPages((prev) =>
            prev.map((p) => (p.id === item.id && !p.thumb ? { ...p, thumb: url } : p)),
          );
        } catch {
          // A single failed preview is not fatal; the placeholder stays.
        }
      }
      if (!cancelled && sessionRef.current === session) setRenderingThumbs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [docReady, visibleCount, pages]);

  async function handleFiles(files: File[]) {
    warmPdfLib();
    const next = files[0];
    if (!next) return;
    setError(null);
    setResult(null);
    // Tear down any previously loaded document.
    sessionRef.current += 1;
    void docRef.current?.destroy();
    docRef.current = null;
    setFile(next);
    setPages([]);
    setVisibleCount(INITIAL_THUMB_COUNT);
    const session = sessionRef.current;
    try {
      const bytes = new Uint8Array(await next.arrayBuffer());
      const doc = await loadPdfJsDocument(bytes);
      if (sessionRef.current !== session) {
        void doc.destroy();
        return;
      }
      docRef.current = doc;
      setPages(
        Array.from({ length: doc.numPages }, (_, i) => ({
          id: i,
          sourceIndex: i,
          rotation: 0 as PageRotation,
          deleted: false,
          selected: false,
          thumb: null,
        })),
      );
      setDocReady((value) => value + 1);
    } catch (err) {
      if (sessionRef.current === session) {
        setError(toolErrorMessage(err, dict));
        setFile(null);
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === active.id);
      const to = prev.findIndex((p) => p.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function toggleSelect(id: number) {
    setPages((prev) =>
      prev.map((p) => (p.id === id && !p.deleted ? { ...p, selected: !p.selected } : p)),
    );
  }

  function toggleDelete(id: number) {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, deleted: !p.deleted, selected: false } : p)),
    );
  }

  /** Adds +90° to one page and re-renders its thumbnail with the new angle. */
  async function rotatePage(id: number) {
    const item = pagesRef.current.find((p) => p.id === id);
    const doc = docRef.current;
    if (!item) return;
    const rotation = ((item.rotation + 90) % 360) as PageRotation;
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, rotation } : p)));
    if (!doc) return;
    const session = sessionRef.current;
    try {
      const url = await renderThumbnail(doc.doc, item.sourceIndex + 1, rotation, THUMB_WIDTH);
      if (sessionRef.current !== session) return;
      // Only apply if the page still has the rotation we rendered for — the
      // user may have clicked again while this render was in flight.
      setPages((prev) =>
        prev.map((p) => (p.id === id && p.rotation === rotation ? { ...p, thumb: url } : p)),
      );
    } catch {
      // A failed thumbnail refresh is not fatal.
    }
  }

  function selectAll() {
    setPages((prev) => prev.map((p) => (p.deleted ? p : { ...p, selected: true })));
  }

  function clearSelection() {
    setPages((prev) => prev.map((p) => ({ ...p, selected: false })));
  }

  function deleteSelected() {
    setPages((prev) =>
      prev.map((p) => (p.selected ? { ...p, deleted: true, selected: false } : p)),
    );
  }

  async function rotateSelected() {
    const ids = pagesRef.current.filter((p) => p.selected && !p.deleted).map((p) => p.id);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop -- sequential to bound memory
      await rotatePage(id);
    }
  }

  function reset() {
    // Pages that were rotated need a fresh thumbnail at 0° — nulling their
    // thumb lets the render effect above regenerate it.
    setPages((prev) =>
      [...prev]
        .sort((a, b) => a.sourceIndex - b.sourceIndex)
        .map((p) => ({
          ...p,
          rotation: 0 as PageRotation,
          deleted: false,
          selected: false,
          thumb: p.rotation === 0 ? p.thumb : null,
        })),
    );
  }

  const keptCount = pages.filter((p) => !p.deleted).length;
  const selectedCount = pages.filter((p) => p.selected).length;
  /** Extract mode counts selections; the other modes count kept pages. */
  const actionableCount = preset === 'extract' ? selectedCount : keptCount;

  async function process() {
    if (!file || pages.length === 0) return;
    // Extract mode exports the selected pages; the other modes export what
    // remains after deletions (both honor drag-reordering and rotation).
    const sequence = (
      preset === 'extract'
        ? pages.filter((p) => p.selected && !p.deleted)
        : pages.filter((p) => !p.deleted)
    ).map((p) => ({ sourcePageIndex: p.sourceIndex, rotation: p.rotation }));
    if (sequence.length === 0) {
      setError(ui.errors.noPages);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const output = await organizePdf(bytes, sequence);
      const blob = pdfBlob(output);
      setResult({ name: outputName, size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const toolbarButton =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <ToolShell
      title={copy.heading}
      intro={copy.intro}
      chips={ui.trustChips}
      privacyNote={ui.privacyNote}
      upload={
        <>
          <FileDropzone
            accept="pdf"
            multiple={false}
            maxFiles={1}
            currentCount={file ? 1 : 0}
            maxSizeBytes={maxSizeBytes}
            disabled={busy}
            onFiles={handleFiles}
            dict={dict}
          />
          {file ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5">
              <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {file.name}
                <span className="ml-2 whitespace-nowrap text-xs text-slate-400">
                  {formatBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`${ui.remove}: ${file.name}`}
                disabled={busy}
                onClick={() => {
                  sessionRef.current += 1;
                  void docRef.current?.destroy();
                  docRef.current = null;
                  setFile(null);
                  setPages([]);
                  setResult(null);
                  setError(null);
                }}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </>
      }
      options={
        pages.length > 0 ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={selectAll} disabled={busy} className={toolbarButton}>
                {copy.selectAll}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={busy || selectedCount === 0}
                className={toolbarButton}
              >
                {copy.clearSelection}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={busy || selectedCount === 0}
                className={toolbarButton}
              >
                {copy.deleteSelected}
              </button>
              <button
                type="button"
                onClick={() => void rotateSelected()}
                disabled={busy || selectedCount === 0}
                className={toolbarButton}
              >
                {copy.rotateSelected}
              </button>
              <button type="button" onClick={reset} disabled={busy} className={toolbarButton}>
                {copy.reset}
              </button>
              <span className="ml-auto text-sm text-slate-500">
                {copy.keptSummary
                  .replace('{kept}', String(actionableCount))
                  .replace('{total}', String(pages.length))}
              </span>
            </div>

            {renderingThumbs ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {copy.loadingPreviews}
              </p>
            ) : null}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {pages.map((item) => (
                    <SortablePageCard
                      key={item.id}
                      item={item}
                      copy={copy}
                      busy={busy}
                      onToggleSelect={toggleSelect}
                      onRotate={(id) => void rotatePage(id)}
                      onToggleDelete={toggleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {visibleCount < pages.length ? (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((value) => value + LOAD_MORE_STEP)}
                  className={toolbarButton}
                >
                  {copy.loadMorePreviews}
                </button>
              </div>
            ) : null}
          </div>
        ) : undefined
      }
      action={
        <button
          type="button"
          onClick={process}
          disabled={busy || pages.length === 0 || actionableCount === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {busy ? ui.processing : copy.button}
        </button>
      }
      status={
        error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : undefined
      }
      result={
        result ? (
          <>
            <DownloadCard
              fileName={result.name}
              sizeBytes={result.size}
              url={result.url}
              title={ui.readyTitle}
              downloadLabel={ui.download}
            />
            <ChainNext dict={dict} slug="organize-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
