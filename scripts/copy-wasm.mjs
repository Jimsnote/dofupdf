// Copies the Emscripten .wasm binaries of the jspawn packages into
// public/wasm/ with versioned file names, so the pdf-heavy worker can fetch
// them over HTTP from any (locale-prefixed) page. Runs on postinstall and
// prebuild. Also writes public/wasm/manifest.json mapping each engine to its
// versioned file name — the worker resolves file names through the manifest
// at runtime, so nothing needs to stay in sync by hand.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const packages = [
  { name: '@jspawn/ghostscript-wasm', wasm: 'gs.wasm', out: 'gs', key: 'ghostscript' },
  { name: '@jspawn/qpdf-wasm', wasm: 'qpdf.wasm', out: 'qpdf', key: 'qpdf' },
];

const outDir = join(root, 'public', 'wasm');
mkdirSync(outDir, { recursive: true });

const manifest = {};
for (const pkg of packages) {
  const pkgJsonPath = require.resolve(`${pkg.name}/package.json`);
  const { version } = require(pkgJsonPath);
  const src = join(dirname(pkgJsonPath), pkg.wasm);
  const fileName = `${pkg.out}-${version}.wasm`;
  const dest = join(outDir, fileName);
  copyFileSync(src, dest);
  manifest[pkg.key] = fileName;
  console.log(`copied ${pkg.name}@${version} -> public/wasm/${fileName}`);
}

writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('wrote public/wasm/manifest.json');

// ---------------------------------------------------------------------------
// Tesseract.js 自托管资源（OCR 工具用）→ public/tesseract/
//
// 布局依据（tesseract.js v7 源码实测）：
// - workerPath/langPath/corePath 指向后，worker 直接拼 `${corePath}/tesseract-core-<变体>.wasm.js`；
//   core 的 .wasm.js 加载器按 worker 脚本所在目录解析同名 .wasm —— 所以全部文件平铺同目录。
// - langPath 直接拼接 `${langPath}/eng.traineddata.gz`（自定义 langPath 时不再附加 lang/版本段）。
// - lstmOnly 模式用 4.0.0_best_int 语言数据（更小更准）。
// - 日本語市场対応：eng + jpn 双语种（混排文档识别更好）。
// ---------------------------------------------------------------------------
const tesseractOut = join(root, 'public', 'tesseract');
mkdirSync(tesseractOut, { recursive: true });

const tesseractPkg = dirname(require.resolve('tesseract.js/package.json'));
const corePkg = dirname(require.resolve('tesseract.js-core/package.json'));
const engPkg = dirname(require.resolve('@tesseract.js-data/eng/package.json'));
const jpnPkg = dirname(require.resolve('@tesseract.js-data/jpn/package.json'));

const tesseractFiles = [
  join(tesseractPkg, 'dist', 'worker.min.js'),
  // LSTM-only 的三种 core 变体（worker 运行时按 SIMD 支持自动选择）
  ...['simd-lstm', 'relaxedsimd-lstm', 'lstm'].flatMap((variant) => [
    join(corePkg, `tesseract-core-${variant}.wasm.js`),
    join(corePkg, `tesseract-core-${variant}.wasm`),
  ]),
  join(engPkg, '4.0.0_best_int', 'eng.traineddata.gz'),
  join(jpnPkg, '4.0.0_best_int', 'jpn.traineddata.gz'),
];
for (const src of tesseractFiles) {
  copyFileSync(src, join(tesseractOut, basename(src)));
}
console.log(`copied ${tesseractFiles.length} tesseract assets -> public/tesseract/`);
