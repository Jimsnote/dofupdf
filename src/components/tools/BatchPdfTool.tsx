'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import JSZip from 'jszip';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { applyNameRuleBatch, buildLogCsv, type BatchLogRow, type NameRule } from '@/lib/pdf/batch';
import {
  DEFAULT_PROTECT_PERMISSIONS,
  protectPdf,
  unlockPdf,
} from '@/lib/pdf/protect';
import { pdfBlob } from './blob';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { DownloadCard, formatBytes } from './DownloadCard';
import { toolErrorMessage } from './tool-error';
import { useProStatus } from './use-pro-status';

interface BatchPdfToolProps {
  dict: Dictionary;
  /** protect = まとめて保護 / unlock = まとめて解除（＋パスワード一括変更）。 */
  mode: 'protect' | 'unlock';
}

type RowStatus = 'idle' | 'working' | 'done' | 'failed';

interface Row {
  id: number;
  file: File;
  status: RowStatus;
  error?: string;
}

interface Result {
  name: string;
  size: number;
  url: string;
}

/** 無料枠は 3 ファイルまで。Pro は 1 回 50 ファイル。 */
const FREE_BATCH_MAX = 3;
const PRO_BATCH_MAX = 50;
const DESKTOP_MAX_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
const TOTAL_MAX_MB = 200;
const TOTAL_MAX_BYTES = TOTAL_MAX_MB * 1024 * 1024;

const noop = () => {};

/**
 * 「まとめて処理」モード：複数 PDF を同一パスワードで逐件処理し、ZIP（＋
 * Pro なら log.csv）にまとめる。処理はすべてブラウザ内の既存 WASM エンジン
 * （protectPdf / unlockPdf）を 1 ファイルずつ呼ぶだけで、ファイルも
 * パスワードも端末を離れない。
 */
export function BatchPdfTool({ dict, mode }: BatchPdfToolProps) {
  const ui = dict.toolUi;
  const batch = ui.errors.batch;
  const copy = dict.toolPages[mode === 'protect' ? 'protect-pdf' : 'unlock-pdf'];
  // パスワード確認系の文言は protect-pdf 側の既存キーを使う（unlock には無い）
  const protectCopy = dict.toolPages['protect-pdf'];
  const { pro, loading: proLoading } = useProStatus();

  const [rows, setRows] = useState<Row[]>([]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changeMode, setChangeMode] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nameRule, setNameRule] = useState<NameRule>('original');
  const [maxSizeBytes, setMaxSizeBytes] = useState(DESKTOP_MAX_BYTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialNote, setPartialNote] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const nextId = useRef(0);
  // 批处理中断用。アンマウント時は必ず abort して裏のループを止める。
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) setMaxSizeBytes(MOBILE_MAX_BYTES);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  const patch = (id: number, next: Partial<Row>) =>
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...next } : row)));

  function addFiles(files: File[]) {
    setError(null);
    setResult(null);
    setPartialNote(null);
    const room = PRO_BATCH_MAX - rows.length;
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > room) {
      // 無料枠と Pro で実際の上限が違う（3 / 50）——現在の状態をそのまま出す
      const limit = pro ? PRO_BATCH_MAX : FREE_BATCH_MAX;
      setError(ui.errors.tooManyFiles.replace('{max}', String(limit)));
    }
    if (accepted.length === 0) return;
    const totalBytes =
      rows.reduce((sum, row) => sum + row.file.size, 0) +
      accepted.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > TOTAL_MAX_BYTES) {
      setError(ui.errors.totalTooLarge.replace('{max}', String(TOTAL_MAX_MB)));
      return;
    }
    setRows((prev) => [
      ...prev,
      ...accepted.map((file) => ({ id: nextId.current++, file, status: 'idle' as const })),
    ]);
  }

  function removeRow(id: number) {
    setResult(null);
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  const needsPassword = mode === 'protect' || changeMode;
  const passwordStartsWithDash = needsPassword && password.startsWith('-');
  const passwordOk =
    !needsPassword ||
    (password.length >= 6 && password === confirm && !password.startsWith('-'));
  const passwordMismatch = needsPassword && confirm.length > 0 && password !== confirm;
  const passwordTooShort = needsPassword && password.length > 0 && password.length < 6;

  async function processBatch() {
    if (rows.length === 0 || busy || !passwordOk) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPartialNote(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const finalNames = applyNameRuleBatch(
      rows.map((row) => row.file.name),
      pro ? nameRule : 'original',
    );
    const zip = new JSZip();
    const log: BatchLogRow[] = [];
    let failed = 0;
    let completed = 0;
    let aborted = false;
    try {
      for (let i = 0; i < rows.length; i += 1) {
        // ファイル間の隙間にabortが来た場合も「中断」扱いにする（aborted フラグを立てて抜ける）
        if (controller.signal.aborted) {
          aborted = true;
          break;
        }
        const row = rows[i];
        patch(row.id, { status: 'working', error: undefined });
        try {
          const bytes = new Uint8Array(await row.file.arrayBuffer());
          let output: Uint8Array;
          if (mode === 'protect') {
            output = await protectPdf(bytes, password, DEFAULT_PROTECT_PERMISSIONS, noop, controller.signal);
          } else if (changeMode) {
            const unlocked = await unlockPdf(bytes, currentPassword, noop, controller.signal);
            output = await protectPdf(unlocked, password, DEFAULT_PROTECT_PERMISSIONS, noop, controller.signal);
          } else {
            output = await unlockPdf(bytes, password, noop, controller.signal);
          }
          zip.file(finalNames[i], output);
          completed += 1;
          patch(row.id, { status: 'done' });
          log.push({
            originalName: row.file.name,
            outputName: finalNames[i],
            status: batch.statusDone,
            processedAt: new Date().toISOString(),
          });
        } catch (err) {
          if (controller.signal.aborted) {
            // 中断：進行中のファイルは待機に戻し、失敗として数えない
            patch(row.id, { status: 'idle' });
            aborted = true;
            break;
          }
          failed += 1;
          const message = toolErrorMessage(err, dict);
          patch(row.id, { status: 'failed', error: message });
          log.push({
            originalName: row.file.name,
            outputName: '',
            status: `${batch.statusFailed}（${message}）`,
            processedAt: new Date().toISOString(),
          });
        }
      }
      if (aborted) {
        // 中断：完了分はダウンロード可能に残し、エラー扱いしない
        if (completed > 0) {
          if (pro) zip.file('log.csv', buildLogCsv(log));
          const blob = await zip.generateAsync({ type: 'blob' });
          const name =
            mode === 'protect'
              ? 'protected-batch.zip'
              : changeMode
                ? 'changed-batch.zip'
                : 'unlocked-batch.zip';
          setResult({ name, size: blob.size, url: URL.createObjectURL(blob) });
          setPartialNote(batch.interrupted.replace('{done}', String(completed)));
        } else {
          setPartialNote(batch.interruptedNone);
        }
        return;
      }
      if (failed === rows.length) {
        setError(ui.errors.generic);
        return;
      }
      if (pro) zip.file('log.csv', buildLogCsv(log));
      if (failed > 0) {
        setPartialNote(batch.partialFailure.replace('{failed}', String(failed)));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const name = mode === 'protect' ? 'protected-batch.zip' : changeMode ? 'changed-batch.zip' : 'unlocked-batch.zip';
      setResult({ name, size: blob.size, url: URL.createObjectURL(blob) });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const overFreeLimit = rows.length > FREE_BATCH_MAX;

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
            maxFiles={PRO_BATCH_MAX}
            currentCount={rows.length}
            maxSizeBytes={maxSizeBytes}
            disabled={busy}
            onFiles={addFiles}
            dict={dict}
          />
          {mode === 'unlock' && rows.length > 0 ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {batch.legalNoteBatch}
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-3 py-2 font-semibold">{batch.queueFile}</th>
                    <th className="px-3 py-2 font-semibold">{batch.queueSize}</th>
                    <th className="px-3 py-2 font-semibold">{batch.queueStatus}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="max-w-[240px] px-3 py-2">
                        <span className="flex items-center gap-2">
                          {row.status === 'working' ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                          )}
                          <span className="truncate text-slate-700" title={row.file.name}>
                            {row.file.name}
                          </span>
                        </span>
                        {row.status === 'failed' && row.error ? (
                          <span className="mt-0.5 block text-xs text-red-600">{row.error}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{formatBytes(row.file.size)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            row.status === 'done'
                              ? 'text-emerald-700'
                              : row.status === 'failed'
                                ? 'text-red-600'
                                : row.status === 'working'
                                  ? 'text-brand-700'
                                  : 'text-slate-500'
                          }
                        >
                          {row.status === 'idle'
                            ? batch.statusIdle
                            : row.status === 'working'
                              ? batch.statusWorking
                              : row.status === 'done'
                                ? batch.statusDone
                                : batch.statusFailed}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          aria-label={`${ui.remove}: ${row.file.name}`}
                          onClick={() => removeRow(row.id)}
                          disabled={busy}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40"
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
            {overFreeLimit && !pro && !proLoading ? (
              <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
                {dict.pro.notice}{' '}
                <Link href="/pricing/" className="font-semibold underline-offset-2 hover:underline">
                  {dict.pro.noticeLink}
                </Link>
              </p>
            ) : null}

            {mode === 'unlock' ? (
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={changeMode}
                  onChange={(e) => {
                    setResult(null);
                    setChangeMode(e.target.checked);
                  }}
                  className="h-4 w-4 accent-brand-600"
                />
                {batch.changeModeLabel}
              </label>
            ) : null}

            {mode === 'unlock' && !changeMode ? (
              <div>
                <label htmlFor="batch-pw" className="text-sm font-semibold text-slate-900">
                  {batch.currentPasswordLabel}
                </label>
                <input
                  id="batch-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                />
              </div>
            ) : null}

            {mode === 'unlock' && changeMode ? (
              <div>
                <label htmlFor="batch-cur-pw" className="text-sm font-semibold text-slate-900">
                  {batch.currentPasswordLabel}
                </label>
                <input
                  id="batch-cur-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="off"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                />
              </div>
            ) : null}

            {needsPassword ? (
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor="batch-new-pw" className="text-sm font-semibold text-slate-900">
                    {mode === 'protect' ? batch.sharedPasswordLabel : batch.newPasswordLabel}
                  </label>
                  <input
                    id="batch-new-pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                  />
                </div>
                <div>
                  <label htmlFor="batch-new-pw2" className="text-sm font-semibold text-slate-900">
                    {protectCopy.confirmLabel}
                  </label>
                  <input
                    id="batch-new-pw2"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
                  />
                </div>
                {passwordTooShort ? (
                  <p className="w-full text-xs text-amber-700">{protectCopy.passwordTooShort}</p>
                ) : null}
                {passwordStartsWithDash ? (
                  <p className="w-full text-xs text-red-600">{protectCopy.passwordStartsWithDash}</p>
                ) : null}
                {passwordMismatch ? (
                  <p className="w-full text-xs text-red-600">{protectCopy.passwordMismatch}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label htmlFor="batch-name-rule" className="text-sm font-semibold text-slate-900">
                {batch.nameRuleLabel}
                {!pro ? (
                  <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    {dict.pro.proOnly}
                  </span>
                ) : null}
              </label>
              <select
                id="batch-name-rule"
                value={pro ? nameRule : 'original'}
                onChange={(e) => setNameRule(e.target.value as NameRule)}
                disabled={!pro || busy}
                className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 sm:max-w-md"
              >
                <option value="original">{batch.nameRuleOriginal}</option>
                <option value="suffix">{batch.nameRuleSuffix}</option>
                <option value="serial">{batch.nameRuleSerial}</option>
              </select>
            </div>
          </div>
        ) : undefined
      }
      action={
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void processBatch()}
            disabled={rows.length === 0 || busy || !passwordOk}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {busy
              ? ui.processing
              : mode === 'protect'
                ? batch.processProtect
                : changeMode
                  ? batch.processChange
                  : batch.processUnlock}
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {batch.interrupt}
            </button>
          ) : null}
        </div>
      }
      status={
        <>
          {partialNote ? (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{partialNote}</p>
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
