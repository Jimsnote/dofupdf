'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { applySignatures, displayRectToPdf, type SignaturePlacement } from '@/lib/pdf/sign-pdf';
import { canvasToBlob, loadPdfJsDocument, type PdfJsDocument } from '@/lib/pdf/pdfjs';
import { warmPdfLib } from '@/lib/pdf/pdf-lib';
import { FileDropzone } from './FileDropzone';
import { ToolShell } from './ToolShell';
import { ChainNext } from './ChainNext';
import { DownloadCard, formatBytes } from './DownloadCard';
import { pdfBlob } from './blob';
import { toolErrorMessage } from './tool-error';
import { SignaturePad } from './SignaturePad';
import { SignatureImageUpload } from './SignatureImageUpload';

interface SignPdfToolProps {
  dict: Dictionary;
}

interface Stamp {
  id: number;
  /** 0-based page index. */
  page: number;
  dataUrl: string;
  /** width / height of the signature image. */
  aspect: number;
  /** Position in scale-1 viewport units, top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PageView {
  dataUrl: string;
  /** Scale-1 viewport size (rotation applied). */
  vw: number;
  vh: number;
  /** pdf.js page rotation (0/90/180/270). */
  rotate: number;
}

interface Result {
  name: string;
  size: number;
  url: string;
  blob: Blob;
}

const MAX_SIZE_BYTES = 100 * 1024 * 1024;
const MOBILE_MAX_BYTES = 50 * 1024 * 1024;
const MIN_STAMP_W = 24;

export function SignPdfTool({ dict }: SignPdfToolProps) {
  const ui = dict.toolUi;
  const copy = dict.toolPages['sign-pdf'];
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfJsDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageView, setPageView] = useState<PageView | null>(null);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [signature, setSignature] = useState<{ dataUrl: string; aspect: number } | null>(null);
  const [signatureTab, setSignatureTab] = useState<'draw' | 'upload'>('draw');
  const [maxSizeBytes, setMaxSizeBytes] = useState(MAX_SIZE_BYTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const nextId = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: number;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
  } | null>(null);

  useEffect(() => {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      setMaxSizeBytes(MOBILE_MAX_BYTES);
    }
  }, []);

  useEffect(() => {
    if (!result) return undefined;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  // Tear down the pdf.js document when the file changes or on unmount.
  useEffect(() => {
    return () => {
      void pdfDoc?.destroy();
    };
  }, [pdfDoc]);

  // Render the current page preview whenever the doc or page changes.
  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc) {
      setPageView(null);
      return undefined;
    }
    void (async () => {
      const page = await pdfDoc.doc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1400 / viewport.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * scale);
      canvas.height = Math.floor(viewport.height * scale);
      await page.render({
        canvas,
        viewport: page.getViewport({ scale }),
        background: '#ffffff',
      }).promise;
      if (!cancelled) {
        setPageView({
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          vw: viewport.width,
          vh: viewport.height,
          rotate: ((page.rotate % 360) + 360) % 360,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage]);

  async function onFile(incoming: File) {
    setError(null);
    setResult(null);
    setStamps([]);
    setSelectedId(null);
    setPdfDoc(null);
    setFile(incoming);
    warmPdfLib();
    try {
      const bytes = new Uint8Array(await incoming.arrayBuffer());
      const doc = await loadPdfJsDocument(bytes);
      setPdfBytes(bytes);
      setPdfDoc(doc);
      setPageCount(doc.numPages);
      setCurrentPage(1);
    } catch (err) {
      setFile(null);
      setError(toolErrorMessage(err, dict));
    }
  }

  function onSignatureChange(dataUrl: string | null) {
    if (!dataUrl) {
      setSignature(null);
      return;
    }
    const img = new Image();
    img.onload = () => setSignature({ dataUrl, aspect: img.width / img.height });
    img.src = dataUrl;
  }

  function addStamp() {
    if (!signature || !pageView) return;
    const w = Math.min(pageView.vw * 0.35, 220);
    const h = w / signature.aspect;
    const stamp: Stamp = {
      id: nextId.current++,
      page: currentPage - 1,
      dataUrl: signature.dataUrl,
      aspect: signature.aspect,
      x: (pageView.vw - w) / 2,
      y: pageView.vh * 0.62,
      w,
      h,
    };
    setStamps((prev) => [...prev, stamp]);
    setSelectedId(stamp.id);
    setResult(null);
  }

  function vpDelta(event: React.PointerEvent): { dx: number; dy: number } {
    const rect = previewRef.current!.getBoundingClientRect();
    const drag = dragRef.current!;
    // The container keeps the page's aspect ratio, so one scale factor (from
    // width) converts both axes from CSS px to viewport units.
    return {
      dx: ((event.clientX - drag.startX) / rect.width) * pageView!.vw,
      dy: ((event.clientY - drag.startY) / rect.width) * pageView!.vw,
    };
  }

  function onHandleDown(event: React.PointerEvent, stamp: Stamp, mode: 'move' | 'resize') {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    setSelectedId(stamp.id);
    dragRef.current = {
      id: stamp.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origX: stamp.x,
      origY: stamp.y,
      origW: stamp.w,
    };
  }

  function onHandleMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !pageView) return;
    const { dx, dy } = vpDelta(event);
    setStamps((prev) =>
      prev.map((s) => {
        if (s.id !== drag.id) return s;
        if (drag.mode === 'move') {
          return {
            ...s,
            x: Math.min(Math.max(drag.origX + dx, 0), pageView.vw - s.w),
            y: Math.min(Math.max(drag.origY + dy, 0), pageView.vh - s.h),
          };
        }
        const w = Math.min(Math.max(drag.origW + dx, MIN_STAMP_W), pageView.vw - s.x);
        return { ...s, w, h: w / s.aspect };
      }),
    );
  }

  function onHandleUp() {
    dragRef.current = null;
  }

  async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * dataURL → bytes without fetch(): fetching data: URLs is blocked by our
   * CSP (connect-src 'self' blob:), so decode the base64 payload directly.
   */
  function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /** Counter-rotates a signature PNG so it displays upright on rotated pages. */
  async function rotateSignature(dataUrl: string, ccwDegrees: number): Promise<Uint8Array> {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const swap = ccwDegrees === 90 || ccwDegrees === 270;
    canvas.width = swap ? img.height : img.width;
    canvas.height = swap ? img.width : img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-ccwDegrees * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    const blob = await canvasToBlob(canvas, 'image/png');
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function process() {
    if (!pdfBytes || !pdfDoc || stamps.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const pngCache = new Map<string, Uint8Array>();
      const placements: SignaturePlacement[] = [];
      for (const stamp of stamps) {
        const page = await pdfDoc.doc.getPage(stamp.page + 1);
        const viewport = page.getViewport({ scale: 1 });
        const rotate = ((page.rotate % 360) + 360) % 360;
        const [mediaW, mediaH] =
          rotate === 90 || rotate === 270
            ? [viewport.height, viewport.width]
            : [viewport.width, viewport.height];
        const rect = displayRectToPdf(
          { x: stamp.x, y: stamp.y, width: stamp.w, height: stamp.h },
          rotate,
          mediaW,
          mediaH,
        );
        const cacheKey = `${stamp.dataUrl.length}:${rotate}`;
        let png = pngCache.get(cacheKey);
        if (!png) {
          png =
            rotate === 0
              ? dataUrlToBytes(stamp.dataUrl)
              : await rotateSignature(stamp.dataUrl, rotate);
          pngCache.set(cacheKey, png);
        }
        placements.push({ page: stamp.page, rect, png });
      }
      const bytes = await applySignatures(pdfBytes, placements);
      const blob = pdfBlob(bytes);
      setResult({ name: 'signed.pdf', size: blob.size, url: URL.createObjectURL(blob), blob });
    } catch (err) {
      setError(toolErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  const pageStamps = stamps.filter((s) => s.page === currentPage - 1);

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
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">{copy.padLabel}</p>
              <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-1">
                {(['draw', 'upload'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setSignatureTab(tab)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                      signatureTab === tab
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab === 'draw' ? copy.drawTab : copy.uploadTab}
                  </button>
                ))}
              </div>
              {signatureTab === 'draw' ? (
                <SignaturePad
                  onChange={onSignatureChange}
                  clearLabel={copy.clearPad}
                  hint={copy.padHint}
                />
              ) : (
                <SignatureImageUpload
                  onChange={setSignature}
                  copy={{
                    choose: copy.uploadChoose,
                    change: copy.uploadChange,
                    hint: copy.uploadHint,
                    removeBg: copy.uploadRemoveBg,
                    strength: copy.uploadStrength,
                    empty: copy.uploadEmpty,
                    error: copy.uploadError,
                  }}
                />
              )}
              <button
                type="button"
                onClick={addStamp}
                disabled={!signature || !pageView}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {copy.addToPage}
              </button>
              <p className="mt-2 text-xs text-slate-500">{copy.placementHint}</p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  aria-label={copy.prevPage}
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <span className="text-sm text-slate-600">
                  {copy.pageIndicator
                    .replace('{current}', String(currentPage))
                    .replace('{total}', String(pageCount))}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  aria-label={copy.nextPage}
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div
                ref={previewRef}
                className="relative mx-auto w-full max-w-xl select-none overflow-hidden rounded-lg border border-slate-300 bg-slate-100"
                style={pageView ? { aspectRatio: `${pageView.vw}/${pageView.vh}` } : undefined}
              >
                {pageView ? (
                  <img
                    src={pageView.dataUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
                  </div>
                )}
                {pageView &&
                  pageStamps.map((stamp) => (
                    <div
                      key={stamp.id}
                      role="button"
                      tabIndex={0}
                      aria-label={copy.stampLabel}
                      onPointerDown={(e) => onHandleDown(e, stamp, 'move')}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      className={`absolute cursor-move touch-none ${
                        selectedId === stamp.id ? 'ring-2 ring-brand-500' : 'ring-1 ring-brand-300'
                      }`}
                      style={{
                        left: `${(stamp.x / pageView.vw) * 100}%`,
                        top: `${(stamp.y / pageView.vh) * 100}%`,
                        width: `${(stamp.w / pageView.vw) * 100}%`,
                        aspectRatio: `${stamp.w}/${stamp.h}`,
                      }}
                    >
                      <img
                        src={stamp.dataUrl}
                        alt=""
                        className="pointer-events-none h-full w-full"
                        draggable={false}
                      />
                      {selectedId === stamp.id ? (
                        <>
                          <button
                            type="button"
                            aria-label={ui.remove}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStamps((prev) => prev.filter((s) => s.id !== stamp.id));
                              setSelectedId(null);
                              setResult(null);
                            }}
                            className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <div
                            onPointerDown={(e) => onHandleDown(e, stamp, 'resize')}
                            onPointerMove={onHandleMove}
                            onPointerUp={onHandleUp}
                            onPointerCancel={onHandleUp}
                            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-full border border-brand-600 bg-white"
                          />
                        </>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : undefined
      }
      action={
        <button
          type="button"
          onClick={process}
          disabled={busy || !pdfDoc || stamps.length === 0}
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
            <ChainNext dict={dict} slug="sign-pdf" blob={result.blob} fileName={result.name} />
          </>
        ) : undefined
      }
    />
  );
}
