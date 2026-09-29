'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import {
  layoutReceiptsOnA4,
  measureDocumentPages,
  type ItemsPerPage,
  type PageMeasure,
} from '@/lib/pdf/receipt-sheet';
import { getPdfLib, warmPdfLib } from '@/lib/pdf/pdf-lib';
import { FileDropzone } from './FileDropzone';
import { ReceiptSheetPreview } from './ReceiptSheetPreview';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface ReceiptSheetToolProps {
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

const MAX_FILES = 30;
const DESKTOP_MAX_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
/** Combined size cap — every input is held in memory while the sheet is built. */
const TOTAL_MAX_BYTES = 200 * 1024 * 1024;

const PER_PAGE_CHOICES: ItemsPerPage[] = [1, 2, 3, 4, 6, 9];
const MARGIN_CHOICES = [5, 10, 15] as const;
const BINDING_CHOICES = [0, 20, 30] as const;

export function ReceiptSheetTool({ dict }: ReceiptSheetToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['receipt-sheet'];
  const [items, setItems] = useState<FileItem[]>([]);
  const [perPage, setPerPage] = useState<ItemsPerPage>(2);
  const [marginMm, setMarginMm] = useState<number>(10);
  const [bindingMm, setBindingMm] = useState<number>(0);
  // 既定はオフ。A4縦の領収書を「2枚ならべ」すると枠が横長になるため、
  // オンのままだと証憑が横向きに印刷される。まず縮小して正立、を既定にし、
  // 詰めたい人が自分で選ぶようにする。
  const [autoRotate, setAutoRotate] = useState(false);
  const [guideLines, setGuideLines] = useState(false);
  // プレビューと枚数表示は同じ計測値から駆動する。null = まだ読めていない。
  const [measures, setMeasures] = useState<PageMeasure[] | null>(null);
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

  // 各ページの用紙サイズと向きを読み取り、プレビューと「A4何枚分」の事前表示に
  // 使う。1ファイル = 1枚ではなく 1ページ = 1枚なので、ファイル数では測れない。
  // 1件でも読めなければ表示を隠す（間違った並びを見せるよりマシ）。処理自体は
  // ボタン押下時に正しいエラーを返す。
  useEffect(() => {
    if (items.length === 0) {
      setMeasures(null);
      return undefined;
    }
    let cancelled = false;
    // 追加直後はまだ全ファイルのページを知らないので、旧値で間違った並びを
    // 見せないように一度隠す。
    setMeasures(null);
    void (async () => {
      try {
        const { PDFDocument } = await getPdfLib();
        const measured: PageMeasure[] = [];
        for (const item of items) {
          const bytes = new Uint8Array(await item.file.arrayBuffer());
          const doc = await PDFDocument.load(bytes);
          measured.push(...measureDocumentPages(doc));
        }
        if (!cancelled) setMeasures(measured.length > 0 ? measured : null);
      } catch {
        if (!cancelled) setMeasures(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

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
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const inputs = await Promise.all(
        items.map(async ({ file }) => new Uint8Array(await file.arrayBuffer())),
      );
      const bytes = await layoutReceiptsOnA4(inputs, {
        perPage,
        marginMm,
        bindingMm,
        autoRotate,
        guideLines,
      });
      const blob = pdfBlob(bytes);
      setResult({
        name: 'receipts-a4.pdf',
        size: blob.size,
        url: URL.createObjectURL(blob),
        blob,
      });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const marginLabels: Record<(typeof MARGIN_CHOICES)[number], string> = {
    5: copy.marginNarrow,
    10: copy.marginStandard,
    15: copy.marginWide,
  };
  const bindingLabels: Record<(typeof BINDING_CHOICES)[number], string> = {
    0: copy.bindingNone,
    20: copy.bindingTwoHole,
    30: copy.bindingBinder,
  };
  const sheets = measures === null ? null : Math.ceil(measures.length / perPage);

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
      options={
        <div className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.perPageLabel}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PER_PAGE_CHOICES.map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    perPage === value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-700 hover:border-brand-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="per-page"
                    className="sr-only"
                    checked={perPage === value}
                    onChange={() => setPerPage(value)}
                  />
                  {copy.perPageEach.replace('{n}', String(value))}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.marginLabel}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {MARGIN_CHOICES.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="margin"
                    checked={marginMm === value}
                    onChange={() => setMarginMm(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {marginLabels[value]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.bindingLabel}</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {BINDING_CHOICES.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="binding"
                    checked={bindingMm === value}
                    onChange={() => setBindingMm(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {bindingLabels[value]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(event) => setAutoRotate(event.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              {copy.autoRotateLabel}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={guideLines}
                onChange={(event) => setGuideLines(event.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              {copy.guideLabel}
            </label>
          </div>

          {sheets !== null ? (
            <p className="rounded-lg bg-brand-50 px-4 py-2.5 text-sm text-brand-800">
              {copy.sheetsHint
                .replace('{sheets}', String(sheets))
                .replace('{items}', String(measures?.length ?? 0))}
            </p>
          ) : null}

          <ReceiptSheetPreview
            dict={dict}
            options={{ perPage, marginMm, bindingMm, autoRotate, guideLines }}
            measures={measures}
            hasFiles={items.length > 0}
          />
        </div>
      }
      action={
        <button
          type="button"
          onClick={process}
          disabled={busy || items.length === 0}
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
            <ChainNext dict={dict} slug="receipt-sheet" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
