import { runHeavyTask, type HeavyProgress } from './heavy-worker';
import type { GsPreset } from './heavy-protocol';

export type CompressionLevel = 'extreme' | 'recommended' | 'light';

/** Ghostscript downsampling presets behind the UI's three levels. */
const LEVEL_PRESETS: Record<CompressionLevel, GsPreset> = {
  extreme: '/screen', // 72 DPI
  recommended: '/ebook', // 150 DPI
  light: '/printer', // 300 DPI
};

/**
 * Rebuilds a PDF with Ghostscript's `pdfwrite` device at the given level,
 * downsampling and recompressing images. Runs in a Web Worker; the first call
 * downloads the ~15 MB Ghostscript wasm (progress is reported through
 * `onProgress`). Resolves with the compressed bytes — which can occasionally
 * be larger than the input for already-optimized files.
 */
export function compressPdf(
  bytes: Uint8Array,
  level: CompressionLevel,
  onProgress?: (progress: HeavyProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return runHeavyTask({ kind: 'compress', preset: LEVEL_PRESETS[level] }, bytes, onProgress, signal);
}
