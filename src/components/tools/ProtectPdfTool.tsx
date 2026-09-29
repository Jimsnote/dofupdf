'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import {
  DEFAULT_PROTECT_PERMISSIONS,
  protectPdf,
  type ProtectPermissions,
} from '@/lib/pdf/protect';
import type { HeavyProgress } from '@/lib/pdf/heavy-worker';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { EngineStatus } from './EngineStatus';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface ProtectPdfToolProps {
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
const MIN_PASSWORD_LENGTH = 6;
/** Approximate qpdf wasm size, shown in the first-run download note. */
const ENGINE_SIZE_MB = '1.2';

type Printing = ProtectPermissions['printing'];

export function ProtectPdfTool({ dict }: ProtectPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['protect-pdf'];
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [permissions, setPermissions] = useState<ProtectPermissions>(DEFAULT_PROTECT_PERMISSIONS);
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<HeavyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
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

  // Terminate the worker when the component unmounts mid-task.
  useEffect(() => () => abortRef.current?.abort(), []);

  function setFlag(key: keyof Omit<ProtectPermissions, 'printing'>, value: boolean) {
    setPermissions((current) => ({ ...current, [key]: value }));
  }

  async function process() {
    if (!file) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(copy.passwordTooShort);
      return;
    }
    if (password !== confirm) {
      setError(copy.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const output = await protectPdf(bytes, password, permissions, setProgress, controller.signal);
      const blob = pdfBlob(output);
      setResult({ name: 'protected.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }

  const flagToggles: Array<{
    key: keyof Omit<ProtectPermissions, 'printing'>;
    label: string;
  }> = [
    { key: 'copying', label: copy.allowCopying },
    { key: 'modifying', label: copy.allowModifying },
    { key: 'annotating', label: copy.allowAnnotating },
    { key: 'assembling', label: copy.allowAssembling },
    { key: 'accessibility', label: copy.allowAccessibility },
  ];

  const printingOptions: Array<{ value: Printing; label: string }> = [
    { value: 'full', label: copy.printFull },
    { value: 'low', label: copy.printLow },
    { value: 'none', label: copy.printNone },
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-900">
              {copy.passwordLabel}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-900">
              {copy.confirmLabel}
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">
              {copy.permissionsHeading}
            </legend>
            <div className="mt-2 space-y-3">
              <div>
                <span className="text-sm text-slate-700">{copy.printingLabel}</span>
                <div className="mt-1.5 flex flex-wrap gap-4">
                  {printingOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="protect-printing"
                        checked={permissions.printing === option.value}
                        onChange={() =>
                          setPermissions((current) => ({ ...current, printing: option.value }))
                        }
                        className="h-4 w-4 accent-brand-600"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              {flagToggles.map((toggle) => (
                <label key={toggle.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={permissions[toggle.key]}
                    onChange={(event) => setFlag(toggle.key, event.target.checked)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {toggle.label}
                </label>
              ))}
            </div>
          </fieldset>
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
            <EngineStatus progress={progress} dict={dict} engineSizeMb={ENGINE_SIZE_MB} />
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
            <DownloadCard
              fileName={result.name}
              sizeBytes={result.size}
              url={result.url}
              title={ui.readyTitle}
              downloadLabel={ui.download}
            />
            <ChainNext dict={dict} slug="protect-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
