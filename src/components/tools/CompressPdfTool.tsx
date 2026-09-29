'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { compressPdf, type CompressionLevel } from '@/lib/pdf/compress';
import type { HeavyProgress } from '@/lib/pdf/heavy-worker';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { formatBytes } from './DownloadCard';
import { EngineStatus } from './EngineStatus';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface CompressPdfToolProps {
  dict: Dictionary;
}

interface Result {
  name: string;
  size: number;
  url: string;
  originalSize: number;
  blob: Blob;
}

const LEVELS: CompressionLevel[] = ['extreme', 'recommended', 'light'];
const MAX_SIZE_BYTES = 150 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
/** After this long, an extra "still working" hint appears (the task keeps running). */
const SLOW_NOTICE_MS = 3 * 60 * 1000;
/** Approximate Ghostscript wasm size, shown in the first-run download note. */
const ENGINE_SIZE_MB = '15';

export function CompressPdfTool({ dict }: CompressPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['compress-pdf'];
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<CompressionLevel>('recommended');
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<HeavyProgress | null>(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const slowTimer = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMaxSizeBytes(MOBILE_MAX_BYTES);
    }
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  useEffect(
    () => () => {
      if (slowTimer.current !== null) window.clearTimeout(slowTimer.current);
      abortRef.current?.abort();
    },
    [],
  );

  async function process() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setSlowNotice(false);
    slowTimer.current = window.setTimeout(() => setSlowNotice(true), SLOW_NOTICE_MS);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const output = await compressPdf(bytes, level, setProgress, controller.signal);
      const blob = pdfBlob(output);
      setResult({
        name: 'compressed.pdf',
        size: blob.size,
        url: URL.createObjectURL(blob),
        originalSize: file.size,
        blob,
      });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      if (slowTimer.current !== null) {
        window.clearTimeout(slowTimer.current);
        slowTimer.current = null;
      }
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }

  const processingText =
    progress && progress.stage === 'process' && progress.current && progress.total
      ? copy.processingPages
          .replace('{current}', String(progress.current))
          .replace('{total}', String(progress.total))
      : undefined;

  const delta = result ? result.size - result.originalSize : 0;
  const deltaPercent = result
    ? Math.round((Math.abs(delta) / Math.max(result.originalSize, 1)) * 100)
    : 0;

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
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">{copy.levelLabel}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {LEVELS.map((value) => {
              const selected = level === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => setLevel(value)}
                  aria-pressed={selected}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                    selected
                      ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                      : 'border-slate-200 bg-white hover:border-brand-300'
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-900">
                    {copy.levels[value].name}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                    {copy.levels[value].description}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
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
        <>
          {progress ? (
            <EngineStatus
              progress={progress}
              dict={dict}
              engineSizeMb={ENGINE_SIZE_MB}
              processingText={processingText}
            />
          ) : null}
          {busy && slowNotice ? (
            <p role="status" className="mt-3 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              {copy.stillWorking}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </>
      }
      result={
        result ? (
          <>
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-green-200 bg-green-50 p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <FileCheck2 className="h-8 w-8 shrink-0 text-green-600" aria-hidden />
              <div>
                <p className="font-semibold text-slate-900">{ui.readyTitle}</p>
                <p className="text-sm text-slate-600">
                  {result.name} · {formatBytes(result.originalSize)} → {formatBytes(result.size)} ·{' '}
                  {delta < 0
                    ? copy.resultSmaller.replace('{percent}', String(deltaPercent))
                    : copy.resultLarger.replace('{percent}', String(deltaPercent))}
                </p>
              </div>
            </div>
            <a
              href={result.url}
              download={result.name}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <Download className="h-4 w-4" aria-hidden />
              {ui.download}
            </a>
          </div>
            <ChainNext dict={dict} slug="compress-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
