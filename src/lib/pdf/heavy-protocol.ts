/**
 * Message protocol between the main thread and `src/workers/pdf-heavy.worker.ts`.
 * Pure types — safe to import from both the client lib and the worker.
 */

/** Ghostscript downsampling presets behind the three compression levels. */
export type GsPreset = '/screen' | '/ebook' | '/printer';

/** qpdf 256-bit encryption restriction flags. */
export interface QpdfPermissions {
  print: 'full' | 'low' | 'none';
  modify: 'all' | 'none';
  extract: boolean;
  annotate: boolean;
  assemble: boolean;
  accessibility: boolean;
}

export type HeavyTask =
  | { kind: 'compress'; preset: GsPreset }
  | {
      kind: 'encrypt';
      userPassword: string;
      ownerPassword: string;
      permissions: QpdfPermissions;
    }
  | { kind: 'decrypt'; password: string };

/** Main thread → worker. The ArrayBuffer is transferred, not copied. */
export interface HeavyRequest {
  task: HeavyTask;
  pdf: ArrayBuffer;
}

export type HeavyProgress =
  | { stage: 'download'; loaded: number; total: number | null }
  | { stage: 'process'; current: number | null; total: number | null };

export type HeavyErrorCode =
  | 'encrypted'
  | 'corrupted'
  | 'wrong-password'
  | 'not-encrypted'
  | 'generic';

/** Worker → main thread. `done` transfers the result buffer back. */
export type HeavyEvent =
  | ({ type: 'progress' } & HeavyProgress)
  | { type: 'done'; pdf: ArrayBuffer }
  | { type: 'error'; code: HeavyErrorCode; message?: string };
