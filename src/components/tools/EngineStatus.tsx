import { Loader2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import type { HeavyProgress } from '@/lib/pdf/heavy-worker';

interface EngineStatusProps {
  progress: HeavyProgress;
  dict: Dictionary;
  /** Approximate engine download size in MB, e.g. '15' or '1.2'. */
  engineSizeMb: string;
  /** Optional override for the processing-stage label (e.g. page progress). */
  processingText?: string;
}

/**
 * Progress feedback for the WASM-backed tools: a byte-progress bar while the
 * (first-use-only) engine download runs, then a spinner while processing.
 */
export function EngineStatus({ progress, dict, engineSizeMb, processingText }: EngineStatusProps) {
  const ui = dict.toolUi;

  if (progress.stage === 'download') {
    const loadedMb = (progress.loaded / (1024 * 1024)).toFixed(1);
    const totalMb = progress.total ? (progress.total / (1024 * 1024)).toFixed(1) : null;
    const percent =
      progress.total && progress.total > 0
        ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
        : null;
    return (
      <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden />
          {totalMb
            ? ui.engineLoadingProgress.replace('{loaded}', loadedMb).replace('{total}', totalMb)
            : ui.engineLoading}
        </p>
        {percent !== null ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          {ui.engineFirstRun.replace('{size}', engineSizeMb)}
        </p>
      </div>
    );
  }

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-slate-700">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden />
      {processingText ?? ui.processing}
    </p>
  );
}
