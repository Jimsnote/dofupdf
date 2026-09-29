'use client';

import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { parsePageRanges } from '@/lib/pdf/page-ranges';
import { canvasToBlob, loadPdfJsDocument, renderPageAtDpi } from '@/lib/pdf/pdfjs';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { DownloadCard, formatBytes } from './DownloadCard';
import { toolErrorMessage } from './tool-error';

interface PdfToJpgToolProps {
  dict: Dictionary;
}

type ImageFormat = 'jpg' | 'png';
type Dpi = 72 | 150 | 300;
type Scope = 'all' | 'custom';

interface Result {
  name: string;
  size: number;
  url: string;
}

interface Progress {
  done: number;
  total: number;
}

const DPI_OPTIONS: Dpi[] = [72, 150, 300];
const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
/** Page cap keeps every rendered blob plus the ZIP within memory budgets. */
const MAX_PAGES = 200;
/** iOS Safari refuses canvases with more pixels than this. */
const MAX_CANVAS_PIXELS = 16777216;

export function PdfToJpgTool({ dict }: PdfToJpgToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['pdf-to-jpg'];
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImageFormat>('jpg');
  const [dpi, setDpi] = useState<Dpi>(150);
  const [scope, setScope] = useState<Scope>('all');
  const [pagesInput, setPagesInput] = useState('');
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMaxSizeBytes(MOBILE_MAX_BYTES);
    }
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  async function process() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setNotice(null);
    setProgress(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await loadPdfJsDocument(bytes);
      try {
        const pageCount = doc.numPages;
        const indices =
          scope === 'custom'
            ? parsePageRanges(pagesInput, pageCount)
            : Array.from({ length: pageCount }, (_, i) => i);
        if (indices.length > MAX_PAGES) {
          setError(ui.errors.tooManyPages.replace('{max}', String(MAX_PAGES)));
          return;
        }
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
        // A single page downloads directly; several pages stream into the
        // ZIP one at a time, so blobs never pile up in a separate array.
        const zip = indices.length > 1 ? new JSZip() : null;
        let single: { name: string; blob: Blob } | null = null;
        let clamped = false;
        for (const [i, pageIndex] of indices.entries()) {
          // Sequential rendering keeps peak memory to one canvas at a time.
          // eslint-disable-next-line no-await-in-loop
          const rendered = await renderPageAtDpi(doc.doc, pageIndex + 1, dpi, MAX_CANVAS_PIXELS);
          // eslint-disable-next-line no-await-in-loop
          const blob = await canvasToBlob(
            rendered.canvas,
            mime,
            format === 'jpg' ? 0.92 : undefined,
          );
          clamped = clamped || rendered.clamped;
          // Release the canvas backing store immediately.
          rendered.canvas.width = 0;
          rendered.canvas.height = 0;
          const name = `page-${pageIndex + 1}.${format}`;
          if (zip) zip.file(name, blob);
          else single = { name, blob };
          setProgress({ done: i + 1, total: indices.length });
        }
        if (clamped) setNotice(copy.dpiReduced);

        if (single !== null) {
          const { name, blob } = single;
          setResult({ name, size: blob.size, url: URL.createObjectURL(blob) });
        } else if (zip) {
          const blob = await zip.generateAsync({ type: 'blob' });
          setResult({ name: 'images.zip', size: blob.size, url: URL.createObjectURL(blob) });
        }
      } finally {
        void doc.destroy();
      }
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

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
            onFiles={(files) => {
              setError(null);
              setNotice(null);
              setResult(null);
              setFile(files[0] ?? null);
            }}
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
                  setFile(null);
                  setResult(null);
                  setNotice(null);
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
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.formatLabel}</legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['jpg', copy.formatJpg],
                  ['png', copy.formatPng],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="image-format"
                    checked={format === value}
                    onChange={() => setFormat(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.dpiLabel}</legend>
            <div className="mt-2 flex gap-4">
              {DPI_OPTIONS.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="dpi"
                    checked={dpi === value}
                    onChange={() => setDpi(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {value} DPI
                </label>
              ))}
            </div>
            {dpi === 300 ? <p className="mt-2 text-sm text-amber-600">{copy.dpiHint}</p> : null}
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.scopeLabel}</legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['all', copy.scopeAll],
                  ['custom', copy.scopeCustom],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="page-scope"
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {scope === 'custom' ? (
            <label className="block text-sm font-semibold text-slate-900">
              {copy.scopeLabel}
              <input
                type="text"
                value={pagesInput}
                onChange={(event) => setPagesInput(event.target.value)}
                placeholder={copy.pagesPlaceholder}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
          ) : null}
        </div>
      }
      action={
        <button
          type="button"
          onClick={process}
          disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {busy ? ui.processing : copy.button}
        </button>
      }
      status={
        progress ? (
          <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {copy.renderingProgress
              .replace('{current}', String(progress.done))
              .replace('{total}', String(progress.total))}
          </p>
        ) : error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : notice ? (
          <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {notice}
          </p>
        ) : undefined
      }
      result={
        result ? (
          <DownloadCard
            fileName={result.name}
            sizeBytes={result.size}
            url={result.url}
            title={ui.readyTitle}
            downloadLabel={ui.download}
          />
        ) : undefined
      }
    />
  );
}
