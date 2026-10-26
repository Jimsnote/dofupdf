/**
 * Minimal ambient typings for the jspawn WASM packages, which ship no .d.ts
 * files. The tools deep-import the CJS Emscripten builds (`gs.js`/`qpdf.js`)
 * instead of the package roots because the ESM wrappers assume a global
 * `exports` object that webpack does not provide in the browser bundle.
 */

/** The subset of the Emscripten FS API the PDF tools use. */
interface JspawnEmscriptenFS {
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
  unlink(path: string): void;
}

interface JspawnEmscriptenModule {
  FS: JspawnEmscriptenFS;
  /** Runs the CLI main() with argv (without the program name); returns the exit code. */
  callMain(args: string[]): number;
}

interface JspawnEmscriptenModuleOptions {
  noInitialRun?: boolean;
  /**
   * NOTE: the jspawn Emscripten builds IGNORE this option — their
   * getBinaryPromise() always fetches the locateFile URL. Kept here only for
   * documentation; use locateFile with a blob URL of pre-fetched bytes.
   * The same goes for print/printErr: stdout/stderr are bound to
   * console.log/console.warn at factory time, so diagnostics must be read
   * through a console capture (see pdf-heavy.worker.ts), which is why those
   * options are not declared here anymore.
   */
  wasmBinary?: ArrayBuffer;
  locateFile?: (path: string) => string;
}

declare module '@jspawn/ghostscript-wasm/gs.js' {
  const createModule: (
    options: JspawnEmscriptenModuleOptions,
  ) => Promise<JspawnEmscriptenModule>;
  export default createModule;
}

declare module '@jspawn/qpdf-wasm/qpdf.js' {
  const createModule: (
    options: JspawnEmscriptenModuleOptions,
  ) => Promise<JspawnEmscriptenModule>;
  export default createModule;
}
