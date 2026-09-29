/**
 * Lazy loaders for the Office-conversion libraries (mammoth ~500 KB,
 * turndown ~50 KB, xlsx ~850 KB raw) so they stay out of the first-load
 * bundle. Same retry semantics as the pdf-lib loader: one retry on a failed
 * chunk download, no cached rejections, plus a warm-up helper.
 */
export type MammothModule = typeof import('mammoth');
/** The TurndownService class (turndown uses `export =`). */
export type TurndownCtor = typeof import('turndown');
export type XlsxModule = typeof import('xlsx');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch {
    await sleep(800);
    return load();
  }
}

let mammothPending: Promise<MammothModule> | null = null;
export function getMammoth(): Promise<MammothModule> {
  if (!mammothPending) {
    const p = withRetry(() => import('mammoth'));
    mammothPending = p;
    p.catch(() => {
      mammothPending = null;
    });
    return p;
  }
  return mammothPending;
}

let turndownPending: Promise<{ default: TurndownCtor }> | null = null;
export function getTurndown(): Promise<{ default: TurndownCtor }> {
  if (!turndownPending) {
    const p = withRetry(() => import('turndown'));
    turndownPending = p;
    p.catch(() => {
      turndownPending = null;
    });
    return p;
  }
  return turndownPending;
}

let xlsxPending: Promise<XlsxModule> | null = null;
export function getXlsx(): Promise<XlsxModule> {
  if (!xlsxPending) {
    const p = withRetry(() => import('xlsx'));
    xlsxPending = p;
    p.catch(() => {
      xlsxPending = null;
    });
    return p;
  }
  return xlsxPending;
}

/** Fires background downloads of both engines (called on file pick). */
export function warmOfficeConverters(): void {
  void Promise.all([getMammoth(), getTurndown(), getXlsx()]).catch(() => {});
}
