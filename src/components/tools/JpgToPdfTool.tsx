'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { normalizeImageForPdf } from '@/lib/pdf/image-orientation';
import { warmPdfLib } from '@/lib/pdf/pdf-lib';
import {
  imagesToPdf,
  type ImageFitMode,
  type ImageInput,
  type PageOrientation,
} from '@/lib/pdf/jpg-to-pdf';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';

interface JpgToPdfToolProps {
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

const MAX_FILES = 20;
const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;

export function JpgToPdfTool({ dict }: JpgToPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['jpg-to-pdf'];
  const [items, setItems] = useState<FileItem[]>([]);
  const [orientation, setOrientation] = useState<PageOrientation>('auto');
  const [fitMode, setFitMode] = useState<ImageFitMode>('fit');
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
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

  async function process() {
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // Phone photos carry an EXIF orientation tag; normalizing here (before
      // embedding) keeps auto-orientation and fit calculations correct.
      const images: ImageInput[] = await Promise.all(
        items.map(({ file }) => normalizeImageForPdf(file)),
      );
      const bytes = await imagesToPdf(images, orientation, fitMode);
      const blob = pdfBlob(bytes);
      setResult({ name: 'images.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const selectClass =
    'mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 focus:border-brand-500 focus:outline-none';

  return (
    <ToolShell
      title={copy.heading}
      intro={copy.intro}
      chips={ui.trustChips}
      privacyNote={ui.privacyNote}
      upload={
        <>
          <FileDropzone
            accept="images"
            maxFiles={MAX_FILES}
            currentCount={items.length}
            maxSizeBytes={maxSizeBytes}
            disabled={busy}
            onFiles={(files) => {
              warmPdfLib();
              setError(null);
              setResult(null);
              setItems((prev) => [
                ...prev,
                ...files.map((file) => ({ id: nextId.current++, file })),
              ]);
            }}
            dict={dict}
          />
          {items.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-4 py-2.5">
                  <ImageIcon className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {item.file.name}
                    <span className="ml-2 whitespace-nowrap text-xs text-slate-400">
                      {formatBytes(item.file.size)}
                    </span>
                  </span>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-900">
            {copy.orientationLabel}
            <select
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as PageOrientation)}
              className={selectClass}
            >
              <option value="auto">{copy.orientationAuto}</option>
              <option value="portrait">{copy.orientationPortrait}</option>
              <option value="landscape">{copy.orientationLandscape}</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            {copy.fitLabel}
            <select
              value={fitMode}
              onChange={(event) => setFitMode(event.target.value as ImageFitMode)}
              className={selectClass}
            >
              <option value="fit">{copy.fitFit}</option>
              <option value="fill">{copy.fitFill}</option>
              <option value="original">{copy.fitOriginal}</option>
            </select>
          </label>
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
            <ChainNext dict={dict} slug="jpg-to-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
