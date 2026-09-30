'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import {
  applySealRequests,
  buildSealRequests,
  type HankoMode,
  type PageSizePt,
  type SealGeometry,
  type SealSliceRequest,
} from '@/lib/pdf/hanko';
import { getPdfLib } from '@/lib/pdf/pdf-lib';
import { loadPdfJsDocument, renderThumbnail, type PdfJsDocument } from '@/lib/pdf/pdfjs';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';
import { SignatureImageUpload } from './SignatureImageUpload';

interface HankoPdfToolProps {
  dict: Dictionary;
}

interface Result {
  name: string;
  size: number;
  url: string;
  blob: Blob;
}

interface Slice {
  dataUrl: string;
  bytes: Uint8Array;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
const MM_TO_PT = 72 / 25.4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function HankoPdfTool({ dict }: HankoPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['hanko-pdf'];

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [sizes, setSizes] = useState<PageSizePt[]>([]);

  const [seal, setSeal] = useState<{ dataUrl: string; aspect: number } | null>(null);
  const [sealImage, setSealImage] = useState<HTMLImageElement | null>(null);

  const [mode, setMode] = useState<HankoMode>('kiwame');
  const [sizeMm, setSizeMm] = useState(16.5);
  const [yFrac, setYFrac] = useState(0.45);
  const [seamPage, setSeamPage] = useState(1); // 1-based left page
  const [splitPct, setSplitPct] = useState(50);
  const [stripPct, setStripPct] = useState(35);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) setMaxSizeBytes(MOBILE_MAX_BYTES);
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  useEffect(() => () => void pdfDoc?.destroy(), [pdfDoc]);

  // Decode the uploaded seal image once so slicing and preview can reuse it.
  useEffect(() => {
    if (!seal) {
      setSealImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setSealImage(img);
    img.src = seal.dataUrl;
  }, [seal]);

  // Load pdf-lib page dimensions (unrotated MediaBox, in pt) for geometry.
  useEffect(() => {
    if (!pdfBytes) {
      setSizes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { PDFDocument } = await getPdfLib();
      const doc = await PDFDocument.load(pdfBytes);
      const next: PageSizePt[] = [];
      for (let i = 0; i < doc.getPageCount(); i += 1) {
        const { width, height } = doc.getPage(i).getSize();
        next.push({ width, height });
      }
      if (!cancelled) setSizes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBytes]);

  async function onFile(incoming: File) {
    setError(null);
    setResult(null);
    setFile(incoming);
    setPdfDoc(null);
    try {
      const bytes = new Uint8Array(await incoming.arrayBuffer());
      const doc = await loadPdfJsDocument(bytes);
      setPdfBytes(bytes);
      setPdfDoc(doc);
      setPageCount(doc.numPages);
      setSeamPage(1);
    } catch (err) {
      setFile(null);
      setError(toolErrorMessage(err, dict));
    }
  }

  const geometry: SealGeometry = useMemo(
    () => ({
      mode,
      sealWidthPt: sizeMm * MM_TO_PT,
      sealHeightPt: (sizeMm * MM_TO_PT) / (seal?.aspect || 1),
      yFrac,
      seamPage: clamp(seamPage - 1, 0, Math.max(0, pageCount - 2)),
      splitFrac: splitPct / 100,
      stripFrac: stripPct / 100,
    }),
    [mode, sizeMm, seal, yFrac, seamPage, pageCount, splitPct, stripPct],
  );

  const requests = useMemo(
    () => (sizes.length > 0 ? buildSealRequests(geometry, sizes) : []),
    [geometry, sizes],
  );

  // Crop a horizontal band [from01,to01] of the seal into a PNG slice.
  const sliceBand = useCallback(
    async (from01: number, to01: number): Promise<Slice> => {
      if (!sealImage) throw new Error('No seal image');
      const sx = Math.round(from01 * sealImage.width);
      const sw = Math.max(1, Math.round((to01 - from01) * sealImage.width));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sealImage.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(sealImage, sx, 0, sw, sealImage.height, 0, 0, sw, sealImage.height);
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
      return { dataUrl, bytes: new Uint8Array(await blob.arrayBuffer()) };
    },
    [sealImage],
  );

  // Preview slices, recomputed whenever the requested bands change.
  const [previewSlices, setPreviewSlices] = useState<Record<string, Slice>>({});
  const bandKey = (r: SealSliceRequest) => `${r.from01.toFixed(3)}:${r.to01.toFixed(3)}`;
  const neededBands = useMemo(
    () => Array.from(new Set(requests.map(bandKey))).sort(),
    [requests],
  );
  useEffect(() => {
    if (!sealImage || requests.length === 0) {
      setPreviewSlices({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, Slice> = {};
      for (const r of requests) {
        const key = bandKey(r);
        if (!next[key]) next[key] = await sliceBand(r.from01, r.to01);
      }
      if (!cancelled) setPreviewSlices(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealImage, neededBands.join(','), sliceBand]);

  // Thumbnails for the pages that show a seal (kiwame: seam pair, chain: first page).
  const previewPages = useMemo(() => {
    const set = new Set<number>();
    for (const r of requests) set.add(r.page);
    return Array.from(set).sort((a, b) => a - b).slice(0, 2);
  }, [requests]);

  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!pdfDoc || previewPages.length === 0) {
      setThumbs({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<number, string> = {};
      for (const p of previewPages) {
        next[p] = await renderThumbnail(pdfDoc.doc, p + 1, 0, 520);
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, previewPages.join(',')]);

  async function process() {
    if (!pdfBytes || requests.length === 0 || !sealImage) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const bytes = await applySealRequests(
        pdfBytes,
        requests,
        async (from, to) => (await sliceBand(from, to)).bytes,
      );
      const blob = pdfBlob(bytes);
      setResult({ name: 'stamped.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const canProcess = Boolean(pdfBytes && seal && requests.length > 0 && sizes.length > 0);

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
            onFiles={(files) => void onFile(files[0])}
            dict={dict}
          />
          {file ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700">
              <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {file.name}
                <span className="ml-2 whitespace-nowrap text-xs text-slate-400">
                  {formatBytes(file.size)}
                </span>
              </span>
            </p>
          ) : null}
        </>
      }
      options={
        pdfDoc ? (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">{copy.sealLabel}</p>
              <SignatureImageUpload
                onChange={setSeal}
                copy={{
                  choose: copy.sealChoose,
                  change: copy.sealChange,
                  hint: copy.sealHint,
                  removeBg: copy.uploadRemoveBg,
                  strength: copy.uploadStrength,
                  empty: copy.uploadEmpty,
                  error: copy.uploadError,
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">{copy.modeLabel}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['kiwame', 'chain'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      mode === m
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      {m === 'kiwame' ? copy.modeKiwame : copy.modeChain}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                      {m === 'kiwame' ? copy.modeKiwameDesc : copy.modeChainDesc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  {copy.sizeLabel.replace('{mm}', String(sizeMm))}
                </span>
                <input
                  type="range"
                  min={10}
                  max={30}
                  step={0.5}
                  value={sizeMm}
                  onChange={(e) => setSizeMm(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  {copy.verticalLabel.replace('{pct}', String(Math.round(yFrac * 100)))}
                </span>
                <input
                  type="range"
                  min={0.12}
                  max={0.88}
                  step={0.01}
                  value={yFrac}
                  onChange={(e) => setYFrac(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
              </label>

              {mode === 'kiwame' ? (
                <>
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-500">
                      {copy.seamLabel}
                    </span>
                    <select
                      value={seamPage}
                      onChange={(e) => setSeamPage(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {copy.seamOption
                            .replace('{a}', String(i + 1))
                            .replace('{b}', String(i + 2))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-500">
                      {copy.splitLabel.replace('{pct}', String(splitPct))}
                    </span>
                    <input
                      type="range"
                      min={20}
                      max={80}
                      step={1}
                      value={splitPct}
                      onChange={(e) => setSplitPct(Number(e.target.value))}
                      className="w-full accent-brand-600"
                    />
                  </label>
                </>
              ) : (
                <label className="block text-sm text-slate-700 sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    {copy.stripLabel.replace('{pct}', String(stripPct))}
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={1}
                    value={stripPct}
                    onChange={(e) => setStripPct(Number(e.target.value))}
                    className="w-full accent-brand-600"
                  />
                </label>
              )}
            </div>

            {sealImage && requests.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">{copy.previewHeading}</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {previewPages.map((p) => (
                    <div
                      key={p}
                      className="relative shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
                      style={{ aspectRatio: `${sizes[p].width}/${sizes[p].height}`, width: 200 }}
                    >
                      {thumbs[p] ? (
                        <img src={thumbs[p]} alt="" className="h-full w-full" draggable={false} />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
                        </div>
                      )}
                      {requests
                        .filter((r) => r.page === p)
                        .map((r) => {
                          const slice = previewSlices[bandKey(r)];
                          if (!slice) return null;
                          return (
                            <img
                              key={bandKey(r)}
                              src={slice.dataUrl}
                              alt=""
                              className="pointer-events-none absolute"
                              style={{
                                left: `${(r.rect.x / sizes[p].width) * 100}%`,
                                top: `${((sizes[p].height - r.rect.y - r.rect.height) / sizes[p].height) * 100}%`,
                                width: `${(r.rect.width / sizes[p].width) * 100}%`,
                                height: `${(r.rect.height / sizes[p].height) * 100}%`,
                              }}
                            />
                          );
                        })}
                      <span className="absolute bottom-1 right-1 rounded bg-white/80 px-1.5 text-[10px] font-medium text-slate-600">
                        {copy.pageBadge.replace('{n}', String(p + 1))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : undefined
      }
      action={
        <button
          type="button"
          onClick={() => void process()}
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
            <ChainNext dict={dict} slug="hanko-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
