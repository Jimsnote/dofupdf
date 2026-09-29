'use client';

import { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import {
  applyImageWatermark,
  renderTextWatermarkPng,
  type WatermarkLayout,
} from '@/lib/pdf/watermark';
import { warmPdfLib } from '@/lib/pdf/pdf-lib';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface WatermarkPdfToolProps {
  dict: Dictionary;
}

type WatermarkType = 'text' | 'image';

interface Result {
  name: string;
  size: number;
  url: string;
  blob: Blob;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;

export function WatermarkPdfTool({ dict }: WatermarkPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['watermark-pdf'];
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<WatermarkType>('text');
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState('#707070');
  const [opacity, setOpacity] = useState(0.2);
  const [layout, setLayout] = useState<WatermarkLayout>('tile');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scale, setScale] = useState(0.4);
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

  const canProcess = file !== null && (type === 'text' ? text.trim().length > 0 : imageFile !== null);

  async function process() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const pdfBytes = new Uint8Array(await file.arrayBuffer());
      let output: Uint8Array;
      if (type === 'text') {
        const stamp = await renderTextWatermarkPng(text.trim(), fontSize, color);
        output = await applyImageWatermark(pdfBytes, stamp.png, {
          opacity,
          layout,
          size: { kind: 'points', width: stamp.widthPoints },
        });
      } else {
        if (!imageFile) return;
        const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
        output = await applyImageWatermark(pdfBytes, imageBytes, {
          opacity,
          layout,
          size: { kind: 'pageFraction', fraction: scale },
        });
      }
      const blob = pdfBlob(output);
      setResult({ name: 'watermarked.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
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
            <legend className="text-sm font-semibold text-slate-900">{copy.typeLabel}</legend>
            <div className="mt-2 flex gap-4">
              {(
                [
                  ['text', copy.typeText],
                  ['image', copy.typeImage],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="watermark-type"
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          {type === 'text' ? (
            <>
              <label className="block text-sm font-semibold text-slate-900">
                {copy.textLabel}
                <input
                  type="text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={copy.textPlaceholder}
                  maxLength={100}
                  className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-900">
                  <span className="flex items-center justify-between">
                    {copy.fontSizeLabel}
                    <span className="font-normal text-slate-500">{fontSize} pt</span>
                  </span>
                  <input
                    type="range"
                    min={16}
                    max={96}
                    step={1}
                    value={fontSize}
                    onChange={(event) => setFontSize(Number(event.target.value))}
                    className="mt-2 w-full accent-brand-600"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-900">
                  {copy.colorLabel}
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="mt-1.5 block h-9 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <div>
                <FileDropzone
                  accept="images"
                  multiple={false}
                  maxFiles={1}
                  currentCount={imageFile ? 1 : 0}
                  maxSizeBytes={maxSizeBytes}
                  disabled={busy}
                  onFiles={(files) => {
                    setError(null);
                    setImageFile(files[0] ?? null);
                  }}
                  dict={dict}
                />
                {imageFile ? (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5">
                    <ImageIcon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {imageFile.name}
                      <span className="ml-2 whitespace-nowrap text-xs text-slate-400">
                        {formatBytes(imageFile.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`${ui.remove}: ${imageFile.name}`}
                      disabled={busy}
                      onClick={() => setImageFile(null)}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ) : null}
              </div>
              <label className="block text-sm font-semibold text-slate-900">
                <span className="flex items-center justify-between">
                  {copy.scaleLabel}
                  <span className="font-normal text-slate-500">{Math.round(scale * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  className="mt-2 w-full accent-brand-600"
                />
              </label>
            </>
          )}

          <label className="block text-sm font-semibold text-slate-900">
            <span className="flex items-center justify-between">
              {copy.opacityLabel}
              <span className="font-normal text-slate-500">{Math.round(opacity * 100)}%</span>
            </span>
            <input
              type="range"
              min={0.05}
              max={0.5}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              className="mt-2 w-full accent-brand-600"
            />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">{copy.layoutLabel}</legend>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['tile', copy.layoutTile],
                  ['center', copy.layoutCenter],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="watermark-layout"
                    checked={layout === value}
                    onChange={() => setLayout(value)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {label}
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
          disabled={busy || !canProcess}
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
            <ChainNext dict={dict} slug="watermark-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
