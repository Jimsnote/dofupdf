import { runHeavyTask, type HeavyProgress } from './heavy-worker';

/** User-facing permission switches of the protect tool. */
export interface ProtectPermissions {
  printing: 'full' | 'low' | 'none';
  copying: boolean;
  modifying: boolean;
  annotating: boolean;
  assembling: boolean;
  accessibility: boolean;
}

/** Sensible defaults: viewing is free for password holders, edits are not. */
export const DEFAULT_PROTECT_PERMISSIONS: ProtectPermissions = {
  printing: 'full',
  copying: true,
  modifying: false,
  annotating: true,
  assembling: false,
  accessibility: true,
};

/**
 * Encrypts a PDF with AES-256 (qpdf R=6). The user password is required to
 * open the document; the owner password is generated randomly and discarded,
 * so the permission flags cannot be lifted without re-encrypting. Runs in a
 * Web Worker; the first call downloads the ~1.3 MB qpdf wasm.
 */
export function protectPdf(
  bytes: Uint8Array,
  password: string,
  permissions: ProtectPermissions,
  onProgress?: (progress: HeavyProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return runHeavyTask(
    {
      kind: 'encrypt',
      userPassword: password,
      ownerPassword: crypto.randomUUID(),
      permissions: {
        print: permissions.printing,
        modify: permissions.modifying ? 'all' : 'none',
        extract: permissions.copying,
        annotate: permissions.annotating,
        assemble: permissions.assembling,
        accessibility: permissions.accessibility,
      },
    },
    bytes,
    onProgress,
    signal,
  );
}

/**
 * Removes password protection from a PDF with qpdf `--decrypt`. PDFs that are
 * only permission-restricted (no open password) are unlocked with an empty
 * password, so `password` may be blank. Throws a `PdfToolError` with code
 * `wrong-password` or `not-encrypted` for the two expected failure modes.
 * Runs in a Web Worker.
 */
export function unlockPdf(
  bytes: Uint8Array,
  password: string,
  onProgress?: (progress: HeavyProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return runHeavyTask({ kind: 'decrypt', password }, bytes, onProgress, signal);
}
