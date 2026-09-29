'use client';

import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { extractImagesFromPdf } from '@/lib/pdf/extract-images';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { DownloadCard, formatBytes } from './DownloadCard';
import { toolErrorMessage } from './tool-error';

interface ExtractImagesToolProps {
  dict: Dictionary;
}

type Scope = 'all' | 'custom';

interface Result {
  name: string;
  size: number;
  url: string;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;

export function ExtractImagesTool({ dict }: ExtractImagesToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['extract-images'];
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [pagesInput, setPagesInput] = useState('');
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [foundCount, setFoundCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
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
    setFoundCount(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const images = await extractImagesFromPdf(bytes, {
        range: scope === 'custom' ? pagesInput : undefined,
        onFound: setFoundCount,
      });
      if (images.length === 1) {
        const blob = new Blob([images[0].bytes.slice().buffer as ArrayBuffer]);
        setResult({ name: images[0].name, size: blob.size, url: URL.createObjectURL(blob) });
      } else {
        const zip = new JSZip();
        for (const image of images) zip.file(image.name, image.bytes);
        const blob = await zip.generateAsync({ type: 'blob' });
        setResult({ name: 'images.zip', size: blob.size, url: URL.createObjectURL(blob) });
      }
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
          {scope === 'custom' ? (
            <label className="mt-3 block text-sm font-semibold text-slate-900">
              {copy.pagesLabel}
              <input
                type="text"
                value={pagesInput}
                onChange={(event) => setPagesInput(event.target.value)}
                placeholder={copy.pagesPlaceholder}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
          ) : null}
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
          {busy
            ? foundCount > 0
              ? copy.progressFound.replace('{count}', String(foundCount))
              : ui.processing
            : copy.button}
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
