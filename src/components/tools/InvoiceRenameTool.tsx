'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Sparkles } from 'lucide-react';
import JSZip from 'jszip';
import type { Dictionary } from '@/i18n/locales/ja';
import { pdfToMarkdown } from '@/lib/pdf/pdf-to-markdown';
import { ocrPdf } from '@/lib/pdf/ocr';
import { PdfToolError } from '@/lib/pdf/errors';
import {
  dedupeNames,
  formatDateForDisplay,
  needsReview,
  parseInvoiceMeta,
  renderInvoiceName,
  type InvoiceMeta,
} from '@/lib/pdf/invoice-meta';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { DownloadCard, formatBytes } from './DownloadCard';
import { toolErrorMessage } from './tool-error';

interface InvoiceRenameToolProps {
  dict: Dictionary;
}

type RowStatus = 'loading' | 'text' | 'ocr' | 'done' | 'error';

interface Row {
  id: number;
  file: File;
  status: RowStatus;
  date: string | null; // YYYYMMDD
  amount: number | null;
  vendor: string; // 行ごとの上書き（空ならバッチ値を使う）
  error?: string;
}

interface Result {
  name: string;
  size: number;
  url: string;
}

const MAX_FILES = 20;
const DESKTOP_MAX_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
const OCR_DPI = 200;
const DEFAULT_TEMPLATE = '{{date}}_{{amount}}_{{vendor}}';
const noop = () => {};

/** 日付入力（YYYY-MM-DD）を内部の YYYYMMDD に寄せる。 */
function isoToYmd(iso: string): string | null {
  const digits = iso.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}
function ymdToIso(ymd: string | null): string {
  if (!ymd || ymd.length !== 8) return '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** CSV の一セルを RFC4180 に従いエスケープ。 */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function InvoiceRenameTool({ dict }: InvoiceRenameToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['invoice-rename'];

  const [rows, setRows] = useState<Row[]>([]);
  const [batchVendor, setBatchVendor] = useState('');
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [maxSizeBytes, setMaxSizeBytes] = useState(DESKTOP_MAX_BYTES);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const nextId = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) setMaxSizeBytes(MOBILE_MAX_BYTES);
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  const patch = useCallback((id: number, next: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }, []);

  // テキスト層を試み、無ければ OCR にフォールバック（OCR は逐次実行）。
  const analyze = useCallback(
    async (id: number, file: File) => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let text: string;
        let method: RowStatus = 'text';
        try {
          text = await pdfToMarkdown(bytes);
        } catch (err) {
          if (err instanceof PdfToolError && err.code === 'no-text') {
            patch(id, { status: 'ocr' });
            const ocr = await ocrPdf(bytes, OCR_DPI, noop);
            text = ocr.text;
            method = 'ocr';
          } else {
            throw err;
          }
        }
        const meta: InvoiceMeta = parseInvoiceMeta(text);
        patch(id, { status: method, date: meta.date, amount: meta.amount });
      } catch (err) {
        patch(id, { status: 'error', error: toolErrorMessage(err, dict) });
      }
    },
    [dict, patch],
  );

  function addFiles(files: File[]) {
    setError(null);
    setResult(null);
    const room = MAX_FILES - rows.length;
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > room) {
      setError(ui.errors.tooManyFiles.replace('{max}', String(MAX_FILES)));
    }
    if (accepted.length === 0) return;
    const created: Row[] = accepted.map((file) => ({
      id: nextId.current++,
      file,
      status: 'loading',
      date: null,
      amount: null,
      vendor: '',
    }));
    setRows((prev) => [...prev, ...created]);
    setAnalyzing(true);
    // OCR ワーカーの同時起動を避けるため、追加分は1件ずつ順に流す。
    for (const row of created) {
      queue.current = queue.current.then(() => analyze(row.id, row.file));
    }
    queue.current = queue.current.then(() => setAnalyzing(false));
  }

  function removeRow(id: number) {
    setResult(null);
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  const effectiveVendor = useCallback(
    (row: Row) => (row.vendor.trim() !== '' ? row.vendor.trim() : batchVendor.trim()),
    [batchVendor],
  );

  // 行順のファイル名（拡張子無し）と重複解決後の最終名。テンプレ/編集で再計算。
  const finalNames = (() => {
    const bases = rows.map((row) =>
      renderInvoiceName(
        template,
        { date: row.date, amount: row.amount, vendor: effectiveVendor(row) || null },
        row.file.name.replace(/\.pdf$/i, ''),
      ),
    );
    return dedupeNames(bases);
  })();

  const reviewCount = rows.filter((row) => needsReview({ date: row.date, amount: row.amount, vendor: null })).length;

  async function applyVendorToAll() {
    const v = batchVendor.trim();
    setResult(null);
    setRows((prev) => prev.map((row) => ({ ...row, vendor: v })));
  }

  async function exportZip() {
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const zip = new JSZip();
      const ledger: string[] = [
        [
          copy.csvOriginal,
          copy.csvDate,
          copy.csvAmount,
          copy.csvVendor,
          copy.csvNewName,
          copy.csvMethod,
          copy.csvReview,
        ]
          .map(csvCell)
          .join(','),
      ];
      rows.forEach((row, index) => {
        const newName = `${finalNames[index]}.pdf`;
        zip.file(newName, row.file);
        const vendor = effectiveVendor(row);
        const review = needsReview({ date: row.date, amount: row.amount, vendor: null });
        ledger.push(
          [
            row.file.name,
            formatDateForDisplay(row.date),
            row.amount !== null ? String(row.amount) : '',
            vendor,
            newName,
            row.status === 'ocr' ? copy.methodOcr : row.status === 'text' ? copy.methodText : '',
            review ? copy.yes : copy.no,
          ]
            .map(csvCell)
            .join(','),
        );
      });
      // BOM 付き UTF-8 で書き出し、Excel で日本語が文字化けしないようにする。
      zip.file(copy.ledgerName, `\uFEFF${ledger.join('\r\n')}\r\n`, { createFolders: false });
      const blob = await zip.generateAsync({ type: 'blob' });
      setResult({ name: 'invoices.zip', size: blob.size, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const canExport = rows.length > 0 && !analyzing && !busy;

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
            multiple
            maxFiles={MAX_FILES}
            currentCount={rows.length}
            maxSizeBytes={maxSizeBytes}
            disabled={busy}
            onFiles={addFiles}
            dict={dict}
          />
          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-3 py-2 font-semibold">{copy.colFile}</th>
                    <th className="px-3 py-2 font-semibold">{copy.colDate}</th>
                    <th className="px-3 py-2 font-semibold">{copy.colAmount}</th>
                    <th className="px-3 py-2 font-semibold">{copy.colVendor}</th>
                    <th className="px-3 py-2 font-semibold">{copy.colNew}</th>
                    <th className="px-3 py-2" aria-label={copy.colRemove} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => (
                    <tr key={row.id} className="align-middle">
                      <td className="max-w-[220px] px-3 py-2">
                        <span className="flex items-center gap-2">
                          {row.status === 'loading' || row.status === 'ocr' ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                          )}
                          <span className="truncate text-slate-700" title={row.file.name}>
                            {row.file.name}
                          </span>
                        </span>
                        {row.status === 'error' ? (
                          <span className="mt-0.5 block text-xs text-red-600">{row.error}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={ymdToIso(row.date)}
                          onChange={(e) => {
                            setResult(null);
                            patch(row.id, { date: isoToYmd(e.target.value) });
                          }}
                          className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                          disabled={row.status === 'loading'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={row.amount ?? ''}
                          placeholder={copy.amountPlaceholder}
                          onChange={(e) => {
                            setResult(null);
                            const n = e.target.value === '' ? null : Number(e.target.value);
                            patch(row.id, { amount: Number.isFinite(n as number) ? n : null });
                          }}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                          disabled={row.status === 'loading'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.vendor}
                          placeholder={batchVendor || copy.vendorPlaceholder}
                          onChange={(e) => {
                            setResult(null);
                            patch(row.id, { vendor: e.target.value });
                          }}
                          className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                          disabled={row.status === 'loading'}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`block max-w-[260px] truncate font-mono text-xs ${
                            needsReview({ date: row.date, amount: row.amount, vendor: null })
                              ? 'text-amber-700'
                              : 'text-slate-700'
                          }`}
                          title={finalNames[index]}
                        >
                          {finalNames[index]}
                          <span className="text-slate-400">.pdf</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          aria-label={`${ui.remove}: ${row.file.name}`}
                          onClick={() => removeRow(row.id)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      }
      options={
        rows.length > 0 ? (
          <div className="space-y-5">
            <div>
              <label htmlFor="batch-vendor" className="text-sm font-semibold text-slate-900">
                {copy.batchVendorLabel}
              </label>
              <p className="mt-1 text-xs text-slate-500">{copy.batchVendorHint}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id="batch-vendor"
                  type="text"
                  value={batchVendor}
                  onChange={(e) => {
                    setResult(null);
                    setBatchVendor(e.target.value);
                  }}
                  placeholder={copy.vendorPlaceholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                />
                <button
                  type="button"
                  onClick={() => void applyVendorToAll()}
                  disabled={!batchVendor.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {copy.applyToAll}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="tpl" className="text-sm font-semibold text-slate-900">
                {copy.templateLabel}
              </label>
              <p className="mt-1 text-xs text-slate-500">{copy.templateHint}</p>
              <input
                id="tpl"
                type="text"
                value={template}
                onChange={(e) => {
                  setResult(null);
                  setTemplate(e.target.value);
                }}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm sm:max-w-md"
              />
            </div>
          </div>
        ) : undefined
      }
      action={
        <button
          type="button"
          onClick={() => void exportZip()}
          disabled={!canExport}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {busy ? ui.processing : copy.button}
        </button>
      }
      status={
        <>
          {analyzing ? (
            <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
              {copy.analyzing}
            </p>
          ) : null}
          {rows.length > 0 && reviewCount > 0 && !analyzing ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {copy.reviewNote.replace('{count}', String(reviewCount))}
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
