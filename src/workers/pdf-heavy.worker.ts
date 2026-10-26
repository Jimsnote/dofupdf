/**
 * Web Worker for the heavy, WASM-based PDF tasks (Ghostscript compression,
 * qpdf encryption/decryption). One worker instance handles exactly one task
 * and is terminated by the caller afterwards, so the Emscripten file system
 * never needs cleanup. Must not import React/Next modules.
 *
 * NOTE: the jspawn Emscripten builds bind stdout/stderr to console.log /
 * console.warn at factory time and ignore the print/printErr options, so all
 * engine output is captured by patching console for the duration of the task
 * (see captureConsole).
 */
import type {
  GsPreset,
  HeavyErrorCode,
  HeavyEvent,
  HeavyRequest,
  QpdfPermissions,
} from '@/lib/pdf/heavy-protocol';

// Versioned wasm asset names are published in /wasm/manifest.json by
// scripts/copy-wasm.mjs (generated from the installed package versions), and
// resolved at runtime so this file never hardcodes them.
const WASM_MANIFEST_URL = '/wasm/manifest.json';
/** Cache Storage bucket for the wasm binaries, so they are downloaded once. */
const WASM_CACHE = 'dofupdf-wasm';

/** Maps each heavy engine to its versioned wasm file name in /wasm/. */
interface WasmManifest {
  ghostscript: string;
  qpdf: string;
}

/** Minimal worker-global surface (the project compiles with the DOM lib only). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<HeavyRequest>) => void) | null;
  postMessage(message: HeavyEvent, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

class TaskError extends Error {
  constructor(public readonly code: HeavyErrorCode) {
    super(code);
    this.name = 'TaskError';
  }
}

function post(event: HeavyEvent, transfer?: Transferable[]) {
  ctx.postMessage(event, transfer);
}

/**
 * The jspawn builds route stdout → console.log and stderr → console.warn
 * (bound when the module factory runs, ignoring print/printErr), so the only
 * way to read engine diagnostics is to patch console for the whole engine
 * lifetime. This worker handles exactly one task at a time, so a task-scoped
 * patch is safe; `restore()` runs in a finally on every path.
 */
interface ConsoleCapture {
  stdout: string[];
  stderr: string[];
  /** Optional per-line stdout hook (Ghostscript progress parsing). */
  onStdout: ((line: string) => void) | null;
  restore(): void;
}

function captureConsole(): ConsoleCapture {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const cap: ConsoleCapture = {
    stdout: [],
    stderr: [],
    onStdout: null,
    restore() {
      console.log = originalLog;
      console.warn = originalWarn;
    },
  };
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    cap.stdout.push(line);
    cap.onStdout?.(line);
  };
  console.warn = (...args: unknown[]) => {
    cap.stderr.push(args.map(String).join(' '));
  };
  return cap;
}

/**
 * Downloads a wasm binary while reporting byte progress, so the UI can show
 * how the (large, first-use-only) download is advancing.
 */
async function downloadWasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const totalHeader = Number(response.headers.get('content-length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null;
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    post({ type: 'progress', stage: 'download', loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/** Every wasm binary starts with the magic word "\0asm" — guards against 404 HTML pages. */
function hasWasmMagic(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, 4);
  return head[0] === 0x00 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d;
}

/**
 * Loads a wasm binary, preferring Cache Storage over the network. The
 * binaries are several MB and change only with package upgrades (the URLs
 * are versioned), so caching them across sessions is safe. Falls back to a
 * plain fetch when Cache Storage is unavailable (private mode, quota).
 * Poisoned cache entries (e.g. an HTML error page cached during a broken
 * dev-server session) are detected via the magic word and self-healed.
 */
async function fetchWasm(url: string): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(WASM_CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const cached = await hit.arrayBuffer();
      if (hasWasmMagic(cached)) return cached;
      await cache.delete(url);
    }
  } catch {
    cache = null;
  }
  const bytes = await downloadWasm(url);
  if (!hasWasmMagic(bytes)) {
    throw new Error(`Fetched ${url} but the content is not a wasm binary`);
  }
  if (cache) {
    try {
      await cache.put(
        url,
        new Response(bytes.slice(0), { headers: { 'Content-Type': 'application/wasm' } }),
      );
    } catch {
      // A failed cache write (e.g. quota) is not fatal.
    }
  }
  return bytes;
}

/**
 * Pre-fetches an engine's wasm binary (with download progress + Cache
 * Storage) and hands it to Emscripten as a blob URL. The jspawn Emscripten
 * builds ignore the `wasmBinary` option and always fetch the locateFile URL,
 * so a blob URL is the only way to keep our caching/progress layer. The
 * caller must revoke the URL once the factory promise resolves.
 * Download/manifest failures surface as 'engine-load', not a file problem.
 */
async function engineBlobUrl(engine: keyof WasmManifest): Promise<string> {
  try {
    const bytes = await fetchWasm(await wasmUrl(engine));
    return URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
  } catch (err) {
    if (err instanceof TaskError) throw err;
    throw new TaskError('engine-load');
  }
}

/**
 * Loads the wasm manifest, preferring Cache Storage over the network just
 * like the binaries. The manifest is tiny and versioned file names keep its
 * answers valid, so caching it across sessions is safe. Falls back to a
 * plain fetch when Cache Storage is unavailable.
 */
async function fetchManifest(): Promise<WasmManifest> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(WASM_CACHE);
    const hit = await cache.match(WASM_MANIFEST_URL);
    if (hit) return (await hit.json()) as WasmManifest;
  } catch {
    cache = null;
  }
  const response = await fetch(WASM_MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${WASM_MANIFEST_URL}: HTTP ${response.status}`);
  }
  const manifest = (await response.json()) as WasmManifest;
  if (cache) {
    try {
      await cache.put(
        WASM_MANIFEST_URL,
        new Response(JSON.stringify(manifest), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    } catch {
      // A failed cache write (e.g. quota) is not fatal.
    }
  }
  return manifest;
}

/** Memoized manifest lookup — one worker instance handles one task. */
let manifestPromise: Promise<WasmManifest> | null = null;

function getManifest(): Promise<WasmManifest> {
  if (!manifestPromise) {
    manifestPromise = fetchManifest();
    // Do not cache a rejection: a later retry should hit the network again.
    manifestPromise.catch(() => {
      manifestPromise = null;
    });
  }
  return manifestPromise;
}

/** Resolves an engine's versioned wasm URL through the manifest. */
async function wasmUrl(engine: keyof WasmManifest): Promise<string> {
  const manifest = await getManifest();
  return `/wasm/${manifest[engine]}`;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  // '%PDF-'
  return (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function readOutput(mod: JspawnEmscriptenModule, path: string): Uint8Array {
  let out: Uint8Array;
  try {
    out = mod.FS.readFile(path);
  } catch {
    throw new TaskError('corrupted');
  }
  if (out.length === 0) throw new TaskError('corrupted');
  return out;
}

type EncryptionProbe = 'encrypted' | 'not-encrypted' | 'probe-failed';

/**
 * Tri-state encryption probe built on `qpdf --show-encryption` with an empty
 * password (qpdf's `--is-encrypted` exit codes are unreliable for files that
 * need a password to open — they exit 2 just like unreadable files):
 *  - exit 0 + "File is not encrypted" on stdout → not-encrypted
 *  - exit 0 with an encryption dump → encrypted, openable with empty password
 *  - exit non-zero + "invalid password" on stderr → encrypted, needs password
 *  - anything else (including a thrown error) → probe-failed
 */
async function probeEncryption(cap: ConsoleCapture, input: Uint8Array): Promise<EncryptionProbe> {
  try {
    const mod = await createQpdf();
    mod.FS.writeFile('probe.pdf', input);
    const outMark = cap.stdout.length;
    const errMark = cap.stderr.length;
    const code = mod.callMain(['--show-encryption', '--password=', 'probe.pdf']);
    const stdout = cap.stdout.slice(outMark).join('\n');
    const stderr = cap.stderr.slice(errMark).join('\n');
    if (code === 0 && /not encrypted/i.test(stdout)) return 'not-encrypted';
    if (code === 0) return 'encrypted';
    if (/invalid password/i.test(stderr)) return 'encrypted';
    return 'probe-failed';
  } catch {
    return 'probe-failed';
  }
}

/** Page count via `qpdf --show-npages`; null when the file cannot be read. */
async function qpdfNpages(cap: ConsoleCapture, bytes: Uint8Array): Promise<number | null> {
  try {
    const mod = await createQpdf();
    mod.FS.writeFile('pages.pdf', bytes);
    const outMark = cap.stdout.length;
    const code = mod.callMain(['--show-npages', 'pages.pdf']);
    if (code !== 0) return null;
    const lines = cap.stdout.slice(outMark).filter((line) => line.trim() !== '');
    const n = Number(lines[lines.length - 1]?.trim());
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

async function createQpdf(): Promise<JspawnEmscriptenModule> {
  const { default: createQpdfModule } = await import('@jspawn/qpdf-wasm/qpdf.js').catch(() => {
    throw new TaskError('engine-load');
  });
  const wasmBlobUrl = await engineBlobUrl('qpdf');
  try {
    // print/printErr are ignored by this build — output is read through the
    // task-scoped console capture instead.
    return await createQpdfModule({
      noInitialRun: true,
      // See runCompress: `wasmBinary` is ignored, locateFile must be a blob URL.
      locateFile: () => wasmBlobUrl,
    });
  } catch {
    throw new TaskError('engine-load');
  } finally {
    URL.revokeObjectURL(wasmBlobUrl);
  }
}

async function runCompress(
  cap: ConsoleCapture,
  pdf: ArrayBuffer,
  preset: GsPreset,
): Promise<ArrayBuffer> {
  const input = new Uint8Array(pdf);
  if (!looksLikePdf(input)) throw new TaskError('corrupted');

  const { default: createGs } = await import('@jspawn/ghostscript-wasm/gs.js').catch(() => {
    throw new TaskError('engine-load');
  });
  const wasmBlobUrl = await engineBlobUrl('ghostscript');

  // Ghostscript prints "Processing pages 1 through N." then one "Page n" line
  // per page on stdout; turn that into genuine progress events.
  let totalPages: number | null = null;
  cap.onStdout = (line: string) => {
    const range = /^Processing pages \d+ through (\d+)/.exec(line);
    if (range) {
      totalPages = Number(range[1]);
      return;
    }
    const page = /^Page (\d+)/.exec(line);
    if (page) {
      post({ type: 'progress', stage: 'process', current: Number(page[1]), total: totalPages });
    }
  };

  let mod: JspawnEmscriptenModule;
  try {
    mod = await createGs({
      noInitialRun: true,
      // This Emscripten build ignores `wasmBinary` and always fetches the
      // locateFile URL — hand it the pre-fetched bytes as a blob URL.
      locateFile: () => wasmBlobUrl,
    });
  } catch {
    throw new TaskError('engine-load');
  } finally {
    URL.revokeObjectURL(wasmBlobUrl);
  }

  post({ type: 'progress', stage: 'process', current: null, total: null });
  mod.FS.writeFile('input.pdf', input);
  const errMark = cap.stderr.length;
  const code = mod.callMain([
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    `-dPDFSETTINGS=${preset}`,
    '-dNOPAUSE',
    '-dBATCH',
    '-sOutputFile=output.pdf',
    'input.pdf',
  ]);
  const gsStderr = cap.stderr.slice(errMark).join('\n');
  // Ghostscript reports fatal errors on stderr but can still exit 0, so the
  // diagnostics and the output file itself are the source of truth.
  const gsFatal = /unrecoverable error|error:/i.test(gsStderr);
  let out: Uint8Array | null = null;
  try {
    const read = mod.FS.readFile('output.pdf');
    if (read.length > 0 && looksLikePdf(read)) out = read;
  } catch {
    out = null;
  }
  if (code !== 0 || out === null || gsFatal) {
    // Ghostscript cannot open encrypted PDFs without a password — check for
    // that before writing the file off as corrupted.
    const probe = await probeEncryption(cap, input);
    throw new TaskError(probe === 'encrypted' ? 'encrypted' : 'corrupted');
  }
  // Ghostscript can exit 0 after skipping pages it failed to process — the
  // output must contain exactly as many pages as the input.
  const [inputPages, outputPages] = [await qpdfNpages(cap, input), await qpdfNpages(cap, out)];
  if (inputPages === null || outputPages === null || inputPages !== outputPages) {
    const probe = await probeEncryption(cap, input);
    throw new TaskError(probe === 'encrypted' ? 'encrypted' : 'corrupted');
  }
  return out.slice().buffer;
}

function yn(flag: boolean): 'y' | 'n' {
  return flag ? 'y' : 'n';
}

async function runEncrypt(
  cap: ConsoleCapture,
  pdf: ArrayBuffer,
  userPassword: string,
  ownerPassword: string,
  permissions: QpdfPermissions,
): Promise<ArrayBuffer> {
  const input = new Uint8Array(pdf);
  if (!looksLikePdf(input)) throw new TaskError('corrupted');

  const mod = await createQpdf();
  post({ type: 'progress', stage: 'process', current: null, total: null });
  mod.FS.writeFile('input.pdf', input);
  const code = mod.callMain([
    '--encrypt',
    userPassword,
    ownerPassword,
    '256',
    `--print=${permissions.print}`,
    `--modify=${permissions.modify}`,
    `--extract=${yn(permissions.extract)}`,
    `--annotate=${yn(permissions.annotate)}`,
    // The UI toggle covers annotations AND form filling — without --form the
    // form-filling permission silently stays allowed.
    `--form=${yn(permissions.annotate)}`,
    `--assemble=${yn(permissions.assemble)}`,
    `--accessibility=${yn(permissions.accessibility)}`,
    '--',
    'input.pdf',
    'output.pdf',
  ]);
  // qpdf exit code 3 means "success with warnings" — the output is valid.
  if (code !== 0 && code !== 3) {
    // qpdf cannot read an already-encrypted input without its password.
    const probe = await probeEncryption(cap, input);
    throw new TaskError(probe === 'encrypted' ? 'encrypted' : 'corrupted');
  }
  const out = readOutput(mod, 'output.pdf');
  return out.slice().buffer;
}

async function runDecrypt(
  cap: ConsoleCapture,
  pdf: ArrayBuffer,
  password: string,
): Promise<ArrayBuffer> {
  const input = new Uint8Array(pdf);
  if (!looksLikePdf(input)) throw new TaskError('corrupted');

  const mod = await createQpdf();
  post({ type: 'progress', stage: 'process', current: null, total: null });
  mod.FS.writeFile('input.pdf', input);

  // Restriction-only PDFs (permissions protected, no open password) unlock
  // with an empty password — always try that first so the field can be left
  // blank, then fall back to the password the user typed.
  const candidates = password.length > 0 ? ['', password] : [''];
  let lastStderr = '';
  for (const candidate of candidates) {
    const outMark = cap.stdout.length;
    const errMark = cap.stderr.length;
    // Probe first: qpdf reports "File is not encrypted" on stdout, and exits
    // non-zero with "invalid password" on stderr when the password is wrong.
    const probe = mod.callMain(['--show-encryption', `--password=${candidate}`, 'input.pdf']);
    const probeStdout = cap.stdout.slice(outMark).join('\n');
    const probeStderr = cap.stderr.slice(errMark).join('\n');
    if (probe === 0 && /not encrypted/i.test(probeStdout)) {
      throw new TaskError('not-encrypted');
    }
    if (probe === 0) {
      const decryptErrMark = cap.stderr.length;
      const code = mod.callMain([
        '--decrypt',
        `--password=${candidate}`,
        'input.pdf',
        'output.pdf',
      ]);
      if (code === 0 || code === 3) {
        // readOutput verifies the output file actually exists and is non-empty.
        return readOutput(mod, 'output.pdf').slice().buffer;
      }
      if (/invalid password/i.test(cap.stderr.slice(decryptErrMark).join('\n'))) {
        throw new TaskError('wrong-password');
      }
      throw new TaskError('corrupted');
    }
    lastStderr = probeStderr;
  }
  // Every probe failed: a wrong password says "invalid password" on stderr;
  // anything else means the file itself could not be read.
  throw new TaskError(/invalid password/i.test(lastStderr) ? 'wrong-password' : 'corrupted');
}

ctx.onmessage = async (event: MessageEvent<HeavyRequest>) => {
  const { task, pdf } = event.data;
  const cap = captureConsole();
  try {
    let out: ArrayBuffer;
    switch (task.kind) {
      case 'compress':
        out = await runCompress(cap, pdf, task.preset);
        break;
      case 'encrypt':
        out = await runEncrypt(cap, pdf, task.userPassword, task.ownerPassword, task.permissions);
        break;
      case 'decrypt':
        out = await runDecrypt(cap, pdf, task.password);
        break;
    }
    post({ type: 'done', pdf: out }, [out]);
  } catch (err) {
    const code = err instanceof TaskError ? err.code : 'generic';
    post({ type: 'error', code, message: err instanceof Error ? err.message : String(err) });
  } finally {
    cap.restore();
  }
};
