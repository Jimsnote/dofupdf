'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import {
  decodeSignatureFile,
  renderSignature,
  type DecodedSignature,
} from '@/lib/pdf/signature-image';

interface SignatureImageUploadCopy {
  choose: string;
  change: string;
  hint: string;
  removeBg: string;
  strength: string;
  empty: string;
  error: string;
}

interface SignatureImageUploadProps {
  onChange: (signature: { dataUrl: string; aspect: number } | null) => void;
  copy: SignatureImageUploadCopy;
}

/**
 * Upload alternative to the hand-drawing pad: pick a photo/scan of a paper
 * signature (PNG/JPG/HEIC), optionally strip the white background in-browser
 * with an adjustable strength, and preview the transparent result. Produces
 * the same {dataUrl, aspect} shape as the pad.
 */
export function SignatureImageUpload({ onChange, copy }: SignatureImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<DecodedSignature | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(nextSource: DecodedSignature, nextRemoveBg: boolean, nextThreshold: number) {
    setBusy(true);
    setError(null);
    try {
      const result = await renderSignature(nextSource, {
        removeBg: nextRemoveBg,
        threshold: nextThreshold,
      });
      if (!result) {
        setPreview(null);
        onChange(null);
        setError(copy.empty);
        return;
      }
      setPreview(result.dataUrl);
      onChange({ dataUrl: result.dataUrl, aspect: result.aspect });
    } catch {
      setPreview(null);
      onChange(null);
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const decoded = await decodeSignatureFile(file);
      const nextRemoveBg = !decoded.hadAlpha;
      setSource(decoded);
      setFileName(file.name);
      setRemoveBg(nextRemoveBg);
      await apply(decoded, nextRemoveBg, threshold);
    } catch {
      setSource(null);
      setFileName(null);
      setPreview(null);
      onChange(null);
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.heic,.heif,image/png,image/jpeg,image/heic,image/heif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
          event.target.value = '';
        }}
      />
      <p className="mb-3 text-xs leading-relaxed text-slate-500">{copy.hint}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden />
          )}
          {source ? copy.change : copy.choose}
        </button>
        {fileName ? (
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{fileName}</span>
        ) : null}
      </div>

      {source ? (
        <div className="mt-3 space-y-3">
          <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
            {preview ? (
              <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={removeBg}
              onChange={(event) => {
                setRemoveBg(event.target.checked);
                void apply(source, event.target.checked, threshold);
              }}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            {copy.removeBg}
          </label>
          {removeBg ? (
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs font-medium text-slate-500">{copy.strength}</span>
              <input
                type="range"
                min={0.3}
                max={0.9}
                step={0.05}
                value={threshold}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setThreshold(value);
                  void apply(source, true, value);
                }}
                className="w-full accent-brand-600"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
