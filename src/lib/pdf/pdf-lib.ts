/**
 * Lazy loader for @cantoo/pdf-lib (~584 KB raw). The tool modules used to
 * import it statically, which pulled the whole library into the first-load
 * bundle of every tool page. Loading it on first use keeps the initial
 * download lean; the module-level promise dedupes repeated calls and the
 * browser fetches the chunk only once.
 */
export type PdfLib = typeof import('@cantoo/pdf-lib');

let pending: Promise<PdfLib> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function importOnce(): Promise<PdfLib> {
  // Retry once on failure: a chunk download can die on a flaky connection
  // (e.g. long international routes), and the user-visible symptom would
  // otherwise be a generic "processing failed" error.
  return import('@cantoo/pdf-lib').catch(async () => {
    await sleep(800);
    return import('@cantoo/pdf-lib');
  });
}

export function getPdfLib(): Promise<PdfLib> {
  if (!pending) {
    pending = importOnce();
    // Do not cache a rejection — a later call must be allowed to retry.
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

/**
 * Fires a background download of the library without awaiting it. Called
 * when the user picks a file, so the chunk is usually warm by the time they
 * click the process button.
 */
export function warmPdfLib(): void {
  void getPdfLib().catch(() => {
    /* a warm-up failure is retried at process time */
  });
}
