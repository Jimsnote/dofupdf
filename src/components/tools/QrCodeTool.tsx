'use client';

import { useEffect, useState } from 'react';
import { Download, QrCode as QrCodeIcon } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { ToolShell } from './ToolShell';

type EcLevel = 'L' | 'M' | 'Q' | 'H';

const SIZES = [256, 512, 1024] as const;
const LEVELS: EcLevel[] = ['L', 'M', 'Q', 'H'];

/**
 * QR Code 生成器：输入即所得（防抖 250ms 实时生成），qrcode 库按需动态
 * import，不进首屏包。无文件输入，因此不用 FileDropzone，文本框占 upload 槽。
 */
export function QrCodeTool({ dict }: { dict: Dictionary }) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['qr-code'];
  const [text, setText] = useState('');
  const [size, setSize] = useState<number>(512);
  const [level, setLevel] = useState<EcLevel>('M');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = text.trim();
    if (!value) {
      setDataUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const qr = await import('qrcode');
        const url = await qr.toDataURL(value, {
          width: size,
          margin: 2,
          errorCorrectionLevel: level,
        });
        if (!cancelled) {
          setDataUrl(url);
          setError(null);
        }
      } catch {
        // 内容超出所选纠错级别的容量上限
        if (!cancelled) {
          setDataUrl(null);
          setError(copy.errorTooLong);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, size, level, copy.errorTooLong]);

  function downloadPng() {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'qrcode.png';
    link.click();
  }

  async function downloadSvg() {
    const value = text.trim();
    if (!value) return;
    const qr = await import('qrcode');
    const svg = await qr.toString(value, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: level,
    });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qrcode.svg';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ToolShell
      title={copy.heading}
      intro={copy.intro}
      chips={ui.trustChips}
      privacyNote={copy.privacyNoteInput}
      upload={
        <div>
          <label htmlFor="qr-content" className="text-sm font-semibold text-slate-900">
            {copy.inputLabel}
          </label>
          <textarea
            id="qr-content"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={copy.inputPlaceholder}
            rows={4}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500"
          />
        </div>
      }
      options={
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-size" className="text-sm font-semibold text-slate-900">
              {copy.sizeLabel}
            </label>
            <select
              id="qr-size"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {SIZES.map((value) => (
                <option key={value} value={value}>
                  {value} × {value} px
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="qr-level" className="text-sm font-semibold text-slate-900">
              {copy.levelLabel}
            </label>
            <select
              id="qr-level"
              value={level}
              onChange={(event) => setLevel(event.target.value as EcLevel)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              {LEVELS.map((value) => (
                <option key={value} value={value}>
                  {copy.levels[value.toLowerCase() as 'l' | 'm' | 'q' | 'h']}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
      action={
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={downloadPng}
            disabled={!dataUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-5 w-5" aria-hidden />
            {copy.downloadPng}
          </button>
          <button
            type="button"
            onClick={downloadSvg}
            disabled={!dataUrl}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-6 py-3 text-base font-semibold text-brand-700 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-5 w-5" aria-hidden />
            {copy.downloadSvg}
          </button>
        </div>
      }
      status={
        error ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : undefined
      }
      result={
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-6">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL 预览，无需 next/image 优化
            <img src={dataUrl} alt={copy.heading} className="max-h-80 w-auto rounded-lg" />
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <QrCodeIcon className="h-5 w-5" aria-hidden />
              {copy.emptyHint}
            </p>
          )}
        </div>
      }
    />
  );
}
