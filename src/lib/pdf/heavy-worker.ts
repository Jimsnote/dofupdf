import { PdfToolError } from './errors';
import type { HeavyEvent, HeavyProgress, HeavyRequest, HeavyTask } from './heavy-protocol';

export type { HeavyProgress } from './heavy-protocol';

/** Hard cap for one heavy task — a wedged wasm run must not spin forever. */
const TASK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Runs a heavy WASM task (compress / encrypt / decrypt) in a dedicated Web
 * Worker so the main thread stays responsive. The input bytes are transferred
 * (copied first, so the caller's buffer is never neutered) and the result is
 * transferred back. The worker is terminated as soon as the task settles, on
 * timeout, or when the optional AbortSignal fires (e.g. the calling component
 * unmounted).
 */
export function runHeavyTask(
  task: HeavyTask,
  pdf: Uint8Array,
  onProgress?: (progress: HeavyProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PdfToolError('aborted'));
      return;
    }
    const worker = new Worker(new URL('../../workers/pdf-heavy.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const timer = window.setTimeout(() => {
      settle();
      reject(new PdfToolError('generic', 'The task timed out'));
    }, TASK_TIMEOUT_MS);
    const onAbort = () => {
      settle();
      reject(new PdfToolError('aborted'));
    };
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<HeavyEvent>) => {
      const message = event.data;
      if (message.type === 'progress') {
        const { stage } = message;
        if (stage === 'download') {
          onProgress?.({ stage, loaded: message.loaded, total: message.total });
        } else {
          onProgress?.({ stage, current: message.current, total: message.total });
        }
        return;
      }
      settle();
      if (message.type === 'done') {
        resolve(new Uint8Array(message.pdf));
      } else {
        reject(new PdfToolError(message.code, message.message));
      }
    };
    worker.onerror = () => {
      settle();
      reject(new PdfToolError('generic'));
    };

    const pdfBuffer = pdf.slice().buffer;
    const request: HeavyRequest = { task, pdf: pdfBuffer };
    worker.postMessage(request, [pdfBuffer]);
  });
}
