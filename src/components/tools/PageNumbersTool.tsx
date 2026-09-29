'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import {
  addPageNumbers,
  type PageNumberFormat,
  type PageNumberPosition,
} from '@/lib/pdf/page-numbers';
import { warmPdfLib } from '@/lib/pdf/pdf-lib';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface PageNumbersToolProps {
  dict: Dictionary;
}

interface Result {
  name: string;
  size: number;
  url: string;
  blob: Blob;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;

export function PageNumbersTool({ dict }: PageNumbersToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['page-numbers'];
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center');
  const [format, setFormat] = useState<PageNumberFormat>('n');
  const [startNumber, setStartNumber] = useState(1);
  const [startPage, setStartPage] = useState(1);
  const [fontSize, setFontSize] = useState(12);
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
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
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const output = await addPageNumbers(bytes, {
        position,
        format,
        startNumber,
        startPage,
        fontSize,
        connector: copy.totalConnector,
      });
      const blob = pdfBlob(output);
      setResult({ name: 'numbered.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const positions: [PageNumberPosition, string][] = [
    ['top-left', copy.posTopLeft],
    ['top-center', copy.posTopCenter],
    ['top-right', copy.posTopRight],
    ['bottom-left', copy.posBottomLeft],
    ['bottom-center', copy.posBottomCenter],
    ['bottom-right', copy.posBottomRight],
  ];

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
              warmPdfLib();
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
        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.positionLabel}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {positions.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="number-position"
                    checked={position === value}
                    onChange={() => setPosition(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.formatLabel}</legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['n', copy.formatN],
                  ['n-of-total', copy.formatTotal],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="number-format"
                    checked={format === value}
                    onChange={() => setFormat(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-semibold text-slate-900">
              {copy.startNumberLabel}
              <input
                type="number"
                min={0}
                step={1}
                value={startNumber}
                onChange={(event) => setStartNumber(Number(event.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-900">
              {copy.startPageLabel}
              <input
                type="number"
                min={1}
                step={1}
                value={startPage}
                onChange={(event) => setStartPage(Number(event.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-900">
              {copy.fontSizeLabel}
              <input
                type="number"
                min={6}
                max={72}
                step={1}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
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
            <ChainNext dict={dict} slug="page-numbers" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
