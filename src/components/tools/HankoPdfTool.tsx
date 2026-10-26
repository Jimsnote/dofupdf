'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import {
  applySealRequests,
  buildSealRequests,
  sealRectConverter,
  type HankoMode,
  type SealGeometry,
  type SealPageInfo,
  type SealSliceRequest,
} from '@/lib/pdf/hanko';
import type { PdfPointViewport } from '@/lib/pdf/sign-pdf';
import { canvasToBlob, loadPdfJsDocument, renderThumbnail, type PdfJsDocument } from '@/lib/pdf/pdfjs';
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

function normalizePageRotation(angle: number): SealPageInfo['rotation'] {
  const normalized = ((Math.round(angle) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Data URL conversion failed'));
    reader.readAsDataURL(blob);
  });
}

/** Counter-rotates a display-space slice so it stays upright after PDF page rotation. */
async function rotateSliceForPdf(slice: Slice, rotation: SealSliceRequest['rotation']): Promise<Uint8Array> {
  if (rotation === 0) return slice.bytes;
  const img = await loadImage(slice.dataUrl);
  const canvas = document.createElement('canvas');
  const swap = rotation === 90 || rotation === 270;
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((-rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await canvasToBlob(canvas, 'image/png');
  canvas.width = 0;
  canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

export function HankoPdfTool({ dict }: HankoPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['hanko-pdf'];

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageInfos, setPageInfos] = useState<SealPageInfo[]>([]);

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
  const loadSeq = useRef(0);

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
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setSealImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setError(toolErrorMessage(new Error('Image decode failed'), dict));
    };
    img.src = seal.dataUrl;
    return () => {
      cancelled = true;
    };
  }, [seal, dict]);

  async function onFile(incoming: File) {
    const loadId = ++loadSeq.current;
    setError(null);
    setResult(null);
    setFile(incoming);
    setPdfDoc(null);
    setPdfBytes(null);
    setPageInfos([]);
    setPageCount(0);
    setThumbs({});
    setPreviewSlices({});
    let doc: PdfJsDocument | null = null;
    try {
      const bytes = new Uint8Array(await incoming.arrayBuffer());
      if (loadId !== loadSeq.current) return;
      doc = await loadPdfJsDocument(bytes);
      if (loadId !== loadSeq.current) {
        await doc.destroy();
        return;
      }
      const infos: SealPageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.doc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        infos.push({
          width: viewport.width,
          height: viewport.height,
          rotation: normalizePageRotation(page.rotate),
        });
      }
      if (loadId !== loadSeq.current) {
        await doc.destroy();
        return;
      }
      setPdfBytes(bytes);
      setPdfDoc(doc);
      setPageInfos(infos);
      setPageCount(doc.numPages);
      setSeamPage(1);
    } catch (err) {
      if (doc) await doc.destroy();
      if (loadId !== loadSeq.current) return;
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

  const layout = useMemo(() => {
    if (pageInfos.length === 0) return { requests: [] as SealSliceRequest[], error: null as string | null };
    try {
      return { requests: buildSealRequests(geometry, pageInfos), error: null as string | null };
    } catch (err) {
      return { requests: [] as SealSliceRequest[], error: toolErrorMessage(err, dict) };
    }
  }, [geometry, pageInfos, dict]);
  const requests = layout.requests;

  // Crop a horizontal display-space band [from01,to01] of the seal into a PNG.
  const sliceBand = useCallback(
    async (from01: number, to01: number): Promise<Slice> => {
      if (!sealImage) throw new Error('No seal image');
      const sx = Math.round(from01 * sealImage.width);
      const sw = Math.max(1, Math.round((to01 - from01) * sealImage.width));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sealImage.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is not available');
      ctx.drawImage(sealImage, sx, 0, sw, sealImage.height, 0, 0, sw, sealImage.height);
      const blob = await canvasToBlob(canvas, 'image/png');
      canvas.width = 0;
      canvas.height = 0;
      return { dataUrl: await blobToDataUrl(blob), bytes: new Uint8Array(await blob.arrayBuffer()) };
    },
    [sealImage],
  );

  // Preview slices are display-space bands; PDF-only counter-rotation is done
  // in process(), so the preview always looks like the printed page.
  const [previewSlices, setPreviewSlices] = useState<Record<string, Slice>>({});
  const bandKey = (r: SealSliceRequest) => `${r.from01.toFixed(4)}:${r.to01.toFixed(4)}`;
  useEffect(() => {
    if (!sealImage || requests.length === 0) {
      setPreviewSlices({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next: Record<string, Slice> = {};
        for (const r of requests) {
          const key = bandKey(r);
          if (!next[key]) next[key] = await sliceBand(r.from01, r.to01);
        }
        if (!cancelled) setPreviewSlices(next);
      } catch (err) {
        if (!cancelled) setError(toolErrorMessage(err, dict));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sealImage, requests, sliceBand, dict]);

  // Preview the first seal-bearing pages without rendering a long document.
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
      try {
        const next: Record<number, string> = {};
        for (const p of previewPages) {
          next[p] = await renderThumbnail(pdfDoc.doc, p + 1, 0, 520);
        }
        if (!cancelled) setThumbs(next);
      } catch (err) {
        if (!cancelled) setError(toolErrorMessage(err, dict));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, previewPages, dict]);

  async function process() {
    if (!pdfBytes || !pdfDoc || requests.length === 0 || !sealImage) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const pageNumbers = Array.from(new Set(requests.map((r) => r.page)));
      const viewports = new Map<number, PdfPointViewport>();
      for (const pageNumber of pageNumbers) {
        const page = await pdfDoc.doc.getPage(pageNumber + 1);
        viewports.set(pageNumber, page.getViewport({ scale: 1 }));
      }
      const bytes = await applySealRequests(
        pdfBytes,
        requests,
        async (request) => {
          const slice = await sliceBand(request.from01, request.to01);
          return rotateSliceForPdf(slice, request.rotation);
        },
        sealRectConverter(viewports),
      );
      const blob = pdfBlob(bytes);
      setResult({ name: 'stamped.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const canProcess = Boolean(
    pdfBytes && seal && sealImage && requests.length > 0 && !layout.error && !busy,
  );
  const displayError = layout.error ?? error;

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
                  tooLarge: copy.uploadTooLarge,
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
                  {previewPages.map((p) => {
                    const page = pageInfos[p];
                    return (
                      <div
                        key={p}
                        className="relative shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
                        style={{ aspectRatio: `${page.width}/${page.height}`, width: 200 }}
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
                                  left: `${(r.rect.x / page.width) * 100}%`,
                                  top: `${(r.rect.y / page.height) * 100}%`,
                                  width: `${(r.rect.width / page.width) * 100}%`,
                                  height: `${(r.rect.height / page.height) * 100}%`,
                                }}
                              />
                            );
                          })}
                        <span className="absolute bottom-1 right-1 rounded bg-white/80 px-1.5 text-[10px] font-medium text-slate-600">
                          {copy.pageBadge.replace('{n}', String(p + 1))}
                        </span>
                      </div>
                    );
                  })}
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
          disabled={!canProcess}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {busy ? ui.processing : copy.button}
        </button>
      }
      status={
        displayError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {displayError}
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
