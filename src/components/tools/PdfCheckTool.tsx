'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  ShieldAlert,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { getPdfLib } from '@/lib/pdf/pdf-lib';
import { loadPdfJsDocument, renderPageAtDpi } from '@/lib/pdf/pdfjs';
import {
  CHECK_PRESETS,
  evaluate,
  getPreset,
  summarize,
  type CheckLevel,
  type CheckSpec,
  type Finding,
  type PdfFacts,
} from '@/lib/pdf/check';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { formatBytes } from './DownloadCard';
import { toolErrorMessage } from './tool-error';

interface PdfCheckToolProps {
  dict: Dictionary;
}

interface Row {
  id: number;
  file: File;
  status: 'loading' | 'done' | 'error';
  facts?: PdfFacts;
  error?: string;
}

const MAX_FILES = 10;
const DESKTOP_MAX_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
const MB = 1024 * 1024;
/** 白紙・スキャン検査は先頭このページ数まで描画してサンプルする（負荷抑止）。 */
const SCAN_PAGE_CAP = 30;
/** 白紙判定に使う低解像度描画。 */
const BLANK_DPI = 36;
/** 描画面のうちインク（非白）がthis未満なら白紙とみなす。 */
const BLANK_INK_RATIO = 0.004;

/** PDF ヘッダから版数（例 '1.7'）を読む。先頭 1KB だけ走査する。 */
function readVersion(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  const m = /%PDF-(\d\.\d)/.exec(head);
  return m ? m[1] : '';
}

/** 1 ファイルから検査事実を集める（pdf-lib + pdf.js、すべて端末内）。 */
async function inspectFile(file: File): Promise<PdfFacts> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const version = readVersion(bytes);

  const { PDFDocument } = await getPdfLib();
  let encrypted = false;
  let unreadable = false;
  let pageCount = -1;
  let formFieldCount = 0;
  // strict load が落ち、ignoreEncryption なら読める → パスワード保護あり。
  type LoadedDoc = Awaited<ReturnType<typeof PDFDocument.load>>;
  let doc: LoadedDoc | null = null;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    try {
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      encrypted = true;
    } catch {
      unreadable = true;
    }
  }
  if (doc) {
    pageCount = doc.getPageCount();
    try {
      formFieldCount = doc.getForm().getFields().length;
    } catch {
      formFieldCount = 0;
    }
  }

  // 白紙・スキャンは pdf.js で最努力判定（要パスワード等で開けなければ不明のまま）。
  let blankPages: number[] = [];
  let scannedOnly = false;
  if (!unreadable) {
    try {
      const { doc: pdfDoc, numPages, destroy } = await loadPdfJsDocument(bytes);
      try {
        let textChars = 0;
        const cap = Math.min(numPages, SCAN_PAGE_CAP);
        for (let i = 1; i <= cap; i += 1) {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          for (const item of content.items) {
            const str = (item as { str?: string }).str;
            if (typeof str === 'string') textChars += str.trim().length;
          }
          const { canvas } = await renderPageAtDpi(pdfDoc, i, BLANK_DPI);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const { width, height } = canvas;
            const { data } = ctx.getImageData(0, 0, width, height);
            let ink = 0;
            for (let p = 0; p < data.length; p += 4) {
              if (data[p] < 245 || data[p + 1] < 245 || data[p + 2] < 245) ink += 1;
            }
            if (ink / (width * height) < BLANK_INK_RATIO) blankPages.push(i - 1);
          }
        }
        scannedOnly = numPages > 0 && textChars === 0;
      } finally {
        await destroy();
      }
    } catch {
      // pdf.js で開けない場合は白紙・スキャン検査だけスキップ。
    }
  }

  return {
    bytes: file.size,
    pageCount,
    version,
    encrypted,
    formFieldCount,
    blankPages,
    scannedOnly,
    unreadable,
  };
}

const LEVEL_STYLE: Record<CheckLevel, { ring: string; dot: string; Icon: typeof Check }> = {
  pass: { ring: 'border-emerald-200 bg-emerald-50', dot: 'text-emerald-600', Icon: Check },
  warn: { ring: 'border-amber-200 bg-amber-50', dot: 'text-amber-600', Icon: AlertTriangle },
  fail: { ring: 'border-red-200 bg-red-50', dot: 'text-red-600', Icon: ShieldAlert },
  info: { ring: 'border-slate-200 bg-slate-50', dot: 'text-slate-500', Icon: Info },
};

export function PdfCheckTool({ dict }: PdfCheckToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['pdf-check'];

  const [rows, setRows] = useState<Row[]>([]);
  const [presetId, setPresetId] = useState<string>(CHECK_PRESETS[0].id);
  const [customMB, setCustomMB] = useState(25);
  const [customPages, setCustomPages] = useState(0);
  const [maxSizeBytes, setMaxSizeBytes] = useState(DESKTOP_MAX_BYTES);
  const [error, setError] = useState<string | null>(null);

  const nextId = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) setMaxSizeBytes(MOBILE_MAX_BYTES);
  }, []);

  const patch = useCallback((id: number, next: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }, []);

  const analyze = useCallback(
    async (id: number, file: File) => {
      try {
        const facts = await inspectFile(file);
        patch(id, { status: 'done', facts });
      } catch (err) {
        patch(id, { status: 'error', error: toolErrorMessage(err, dict) });
      }
    },
    [dict, patch],
  );

  function addFiles(files: File[]) {
    setError(null);
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
    }));
    setRows((prev) => [...prev, ...created]);
    // pdf.js の同時描画を避けるため、追加分は1件ずつ順に流す。
    for (const row of created) {
      queue.current = queue.current.then(() => analyze(row.id, row.file));
    }
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  // 選択中の規格（カスタムは入力値から組む）。pure evaluate に渡す。
  const spec: CheckSpec = (() => {
    if (presetId === 'custom') {
      return {
        maxBytes: customMB > 0 ? customMB * MB : undefined,
        maxPages: customPages > 0 ? customPages : undefined,
        forbidSecurity: false,
        minVersion: '',
        forbidFormFields: false,
        flagBlank: true,
      };
    }
    return getPreset(presetId);
  })();

  const analyzing = rows.some((row) => row.status === 'loading');

  // 各行の検査結果と合否サマリ。規格を変えると即再計算（fact は据え置き）。
  const perRow = rows.map((row) => {
    const findings = row.facts ? evaluate(row.facts, spec) : [];
    return { row, findings, verdict: summarize(findings) as CheckLevel };
  });
  const issueFiles = perRow.filter((r) => r.row.status === 'done' && r.verdict !== 'pass').length;

  // --- 1 件の指摘を文言に落とす ---
  function findingLabel(f: Finding): string {
    switch (f.id) {
      case 'size':
        return copy.lblSize;
      case 'pages':
        return copy.lblPages;
      case 'version':
        return copy.lblVersion;
      case 'security':
        return copy.lblSecurity;
      case 'form':
        return copy.lblForm;
      case 'blank':
        return copy.lblBlank;
      case 'scanned':
        return copy.lblScanned;
      case 'corrupt':
        return copy.lblCorrupt;
      default:
        return f.id;
    }
  }

  function fill(template: string, pairs: [string, string][]): string {
    return pairs.reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), template);
  }

  function findingText(f: Finding): string {
    const d = f.detail ?? {};
    switch (f.id) {
      case 'size':
        return f.level === 'fail'
          ? fill(copy.sizeOver, [['{a}', formatBytes(d.actualBytes ?? 0)], ['{limit}', formatBytes(d.limitBytes ?? 0)]])
          : fill(copy.sizeOk, [['{a}', formatBytes(d.actualBytes ?? 0)]]);
      case 'pages':
        return f.level === 'fail'
          ? fill(copy.pagesOver, [['{a}', String(d.pages ?? 0)], ['{limit}', String(d.limitPages ?? 0)]])
          : fill(copy.pagesOk, [['{a}', String(d.pages ?? 0)]]);
      case 'version':
        return f.level === 'pass'
          ? fill(copy.versionOk, [['{v}', d.version ?? '?']])
          : fill(copy.versionLow, [['{v}', d.version ?? '?'], ['{min}', d.minVersion ?? '']]);
      case 'security':
        if (!f.level || f.level === 'pass') return copy.securityOk;
        return f.level === 'fail' ? copy.securityForbid : copy.securityWarn;
      case 'form':
        return f.level === 'pass'
          ? copy.formOk
          : fill(copy.formNote, [['{n}', String(d.formCount ?? 0)]]);
      case 'blank':
        return f.level === 'pass'
          ? copy.blankOk
          : fill(copy.blankNote, [['{n}', String(d.blankCount ?? 0)]]);
      case 'scanned':
        return copy.scannedNote;
      case 'corrupt':
        return copy.corruptNote;
      default:
        return '';
    }
  }

  const canAdd = !analyzing;

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
            disabled={!canAdd}
            onFiles={addFiles}
            dict={dict}
          />
          {rows.length > 0 ? (
            <ul className="mt-6 space-y-4">
              {perRow.map(({ row, findings, verdict }) => {
                const style = LEVEL_STYLE[verdict];
                return (
                  <li key={row.id} className={`rounded-xl border p-4 ${style.ring}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900" title={row.file.name}>
                          {row.file.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatBytes(row.file.size)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {row.status === 'loading' ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            {copy.inspecting}
                          </span>
                        ) : row.status === 'error' ? (
                          <span className="text-sm text-red-600">{row.error}</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${style.dot}`}>
                            <style.Icon className="h-4 w-4" aria-hidden />
                            {verdict === 'fail'
                              ? copy.verdictFail
                              : verdict === 'warn'
                                ? copy.verdictWarn
                                : copy.verdictPass}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`${ui.remove}: ${row.file.name}`}
                          onClick={() => removeRow(row.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>

                    {row.status === 'done' && findings.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {findings.map((f) => {
                          const fs = LEVEL_STYLE[f.level];
                          return (
                            <li key={f.id} className="flex items-start gap-2 text-sm">
                              <fs.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${fs.dot}`} aria-hidden />
                              <span className="text-slate-700">
                                <span className="font-medium text-slate-900">{findingLabel(f)}</span>
                                <span className="text-slate-400"> — </span>
                                {findingText(f)}
                                {f.fixSlug && f.level !== 'pass' ? (
                                  <>
                                    {' '}
                                    <Link
                                      href={`/${f.fixSlug}/`}
                                      className="inline-flex items-center gap-1 font-medium text-brand-700 underline-offset-2 hover:underline"
                                    >
                                      {fill(copy.fixWith, [['{tool}', dict.tools[f.fixSlug as keyof Dictionary['tools']]?.name ?? f.fixSlug]])}
                                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                    </Link>
                                  </>
                                ) : null}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      }
      options={
        <div>
          <p className="text-sm font-semibold text-slate-900">{copy.presetLabel}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CHECK_PRESETS.map((preset) => (
              <label
                key={preset.id}
                className={`flex cursor-pointer flex-col rounded-lg border px-4 py-3 transition-colors ${
                  presetId === preset.id
                    ? 'border-brand-400 bg-brand-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pdf-check-preset"
                    className="h-4 w-4 accent-brand-600"
                    checked={presetId === preset.id}
                    onChange={() => setPresetId(preset.id)}
                  />
                  <span className="font-medium text-slate-900">{presetName(copy, preset.id)}</span>
                </span>
                <span className="mt-1 pl-6 text-xs text-slate-500">{presetHint(copy, preset.id)}</span>
              </label>
            ))}
          </div>
          {presetId === 'custom' ? (
            <div className="mt-4 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {copy.customSizeLabel}
                <input
                  type="number"
                  min={0}
                  value={customMB}
                  onChange={(e) => setCustomMB(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                {copy.customMBUnit}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                {copy.customPagesLabel}
                <input
                  type="number"
                  min={0}
                  value={customPages}
                  onChange={(e) => setCustomPages(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      }
      action={
        rows.length > 0 ? (
          <button
            type="button"
            onClick={() => setRows([])}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {copy.clear}
          </button>
        ) : (
          <span className="text-sm text-slate-500">{copy.pickHint}</span>
        )
      }
      status={
        <>
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {rows.length > 0 && !analyzing ? (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {fill(copy.summaryLine, [
                ['{files}', String(rows.length)],
                ['{issues}', String(issueFiles)],
              ])}
            </p>
          ) : null}
        </>
      }
    />
  );
}

/** プリセット名・説明は ja.ts の copy から引く（ラテン語の夹生を避ける命名）。 */
type CheckCopy = Dictionary['toolPages']['pdf-check'];
function presetName(copy: CheckCopy, id: string): string {
  return (
    {
      immigration: copy.presetImmigration,
      etax: copy.presetEtax,
      email: copy.presetEmail,
      custom: copy.presetCustom,
    }[id] ?? id
  );
}
function presetHint(copy: CheckCopy, id: string): string {
  return (
    {
      immigration: copy.presetImmigrationHint,
      etax: copy.presetEtaxHint,
      email: copy.presetEmailHint,
      custom: copy.presetCustomHint,
    }[id] ?? ''
  );
}
