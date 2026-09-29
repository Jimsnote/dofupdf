'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { mergePdfs } from '@/lib/pdf/merge';
import { warmPdfLib } from '@/lib/pdf/pdf-lib';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface MergePdfToolProps {
  dict: Dictionary;
}

interface FileItem {
  id: number;
  file: File;
}

interface Result {
  name: string;
  size: number;
  url: string;
  blob: Blob;
}

const MAX_FILES = 20;
const MIN_FILES = 2;
const DESKTOP_MAX_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
/** Combined size cap — all inputs are held in memory during the merge. */
const TOTAL_MAX_BYTES = 300 * 1024 * 1024;

export function MergePdfTool({ dict }: MergePdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['merge-pdf'];
  const [items, setItems] = useState<FileItem[]>([]);
  const [maxSizeBytes, setMaxSizeBytes] = useState(DESKTOP_MAX_BYTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMaxSizeBytes(MOBILE_MAX_BYTES);
    }
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  function addFiles(files: File[]) {
    warmPdfLib();
    setError(null);
    setResult(null);
    const total =
      items.reduce((sum, item) => sum + item.file.size, 0) +
      files.reduce((sum, file) => sum + file.size, 0);
    if (total > TOTAL_MAX_BYTES) {
      setError(
        ui.errors.totalTooLarge.replace('{max}', String(Math.round(TOTAL_MAX_BYTES / 1024 / 1024))),
      );
      return;
    }
    setItems((prev) => [...prev, ...files.map((file) => ({ id: nextId.current++, file }))]);
  }

  function move(index: number, delta: -1 | 1) {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function process() {
    if (items.length < MIN_FILES) {
      setError(ui.errors.minFiles.replace('{min}', String(MIN_FILES)));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const inputs = await Promise.all(
        items.map(async ({ file }) => new Uint8Array(await file.arrayBuffer())),
      );
      const bytes = await mergePdfs(inputs);
      const blob = pdfBlob(bytes);
      setResult({ name: 'merged.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
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
            maxFiles={MAX_FILES}
            currentCount={items.length}
            maxSizeBytes={maxSizeBytes}
            disabled={busy}
            onFiles={addFiles}
            dict={dict}
          />
          {items.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {items.map((item, index) => (
                <li key={item.id} className="flex items-center gap-2 px-4 py-2.5">
                  <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {item.file.name}
                    <span className="ml-2 whitespace-nowrap text-xs text-slate-400">
                      {formatBytes(item.file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${ui.moveUp}: ${item.file.name}`}
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${ui.moveDown}: ${item.file.name}`}
                    disabled={index === items.length - 1 || busy}
                    onClick={() => move(index, 1)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${ui.remove}: ${item.file.name}`}
                    disabled={busy}
                    onClick={() => {
                      setResult(null);
                      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
                    }}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      }
      action={
        <button
          type="button"
          onClick={process}
          disabled={busy || items.length < MIN_FILES}
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
            <ChainNext dict={dict} slug="merge-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
