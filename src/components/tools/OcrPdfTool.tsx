'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { ocrPdf, type OcrProgress } from '@/lib/pdf/ocr';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface OcrPdfToolProps {
  dict: Dictionary;
}

interface Result {
  name: string;
  size: number;
  url: string;
  textName: string;
  textUrl: string;
  blob: Blob;
}

const DPI_OPTIONS = [150, 200, 300] as const;
const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * OCR 工具：扫描件 PDF → 可搜索 PDF + 纯文本。Tesseract 引擎按需加载
 * （动态 import + 自托管资源），识别过程逐页汇报进度。
 */
export function OcrPdfTool({ dict }: OcrPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['ocr-pdf'];
  const [file, setFile] = useState<File | null>(null);
  const [dpi, setDpi] = useState<number>(200);
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const resultRef = useRef<Result | null>(null);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMaxSizeBytes(MOBILE_MAX_BYTES);
    }
  }, []);

  // 卸载时释放对象 URL
  useEffect(
    () => () => {
      if (resultRef.current) {
        URL.revokeObjectURL(resultRef.current.url);
        URL.revokeObjectURL(resultRef.current.textUrl);
      }
    },
    [],
  );

  async function process() {
    if (!file) return;
    if (result) {
      URL.revokeObjectURL(result.url);
      URL.revokeObjectURL(result.textUrl);
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { pdfBytes, text } = await ocrPdf(bytes, dpi, setProgress);
      const blob = pdfBlob(pdfBytes);
      const textBlob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const next = {
        name: 'ocr.pdf',
        size: blob.size,
        url: URL.createObjectURL(blob),
        textName: 'ocr.txt',
        textUrl: URL.createObjectURL(textBlob),
        blob,
      };
      resultRef.current = next;
      setResult(next);
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const percent =
    progress?.stage === 'page' && progress.pages
      ? Math.round((((progress.page ?? 1) - 1 + (progress.pageRatio ?? 0)) / progress.pages) * 100)
      : null;

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
        <div>
          <label htmlFor="ocr-dpi" className="text-sm font-semibold text-slate-900">
            {copy.dpiLabel}
          </label>
          <select
            id="ocr-dpi"
            value={dpi}
            disabled={busy}
            onChange={(event) => setDpi(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:max-w-xs"
          >
            {DPI_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {copy.dpiOptions[`d${value}` as 'd150' | 'd200' | 'd300']}
              </option>
            ))}
          </select>
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
        <>
          {progress ? (
            <div className="rounded-lg bg-brand-50 px-4 py-3">
              <p className="text-sm text-brand-900">
                {progress.stage === 'engine'
                  ? copy.engineLoading
                  : copy.processingPages
                      .replace('{current}', String(progress.page ?? 1))
                      .replace('{total}', String(progress.pages ?? 1))}
              </p>
              {percent !== null ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              ) : null}
            </div>
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
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-8 w-8 shrink-0 text-green-600" aria-hidden />
                <div>
                  <p className="font-semibold text-slate-900">{ui.readyTitle}</p>
                  <p className="text-sm text-slate-600">
                    {result.name} · {formatBytes(result.size)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={result.url}
                  download={result.name}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {copy.downloadPdf}
                </a>
                <a
                  href={result.textUrl}
                  download={result.textName}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {copy.downloadText}
                </a>
              </div>
            </div>
            <ChainNext dict={dict} slug="ocr-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
