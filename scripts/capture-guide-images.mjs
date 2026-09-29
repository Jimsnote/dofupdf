/**
 * Captures guide screenshots for all 12 tools with Playwright:
 * generates sample files, serves ./out statically, uploads samples into each
 * tool, processes them, and saves step-1/step-2 screenshots to
 * public/guides/<guide>/. Run: node scripts/capture-guide-images.mjs
 * (requires `npm run build` first and `npx playwright install chromium`).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import zlib from 'node:zlib';
import { PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';

const OUT = resolve('out');
const DEST = resolve('public/guides');
const TMP = resolve('tmp-guide-shots');
const PORT = 4899;

// ---------- sample file generation ----------

/** Minimal solid-color PNG encoder (no image deps). */
function solidPng(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const buf = Buffer.alloc(12 + data.length);
    buf.writeUInt32BE(data.length, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crc = zlib.crc32 ? zlib.crc32(buf.subarray(4, 8 + data.length)) : 0;
    buf.writeUInt32BE(crc >>> 0, 8 + data.length);
    return buf;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** High-detail noise PNG: JPEG re-encoding of this shrinks a lot when the
 *  images are downsampled, so the compress screenshot shows a real reduction. */
function noisePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let seed = 123456789;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % 256;
  };
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      raw[row + 1 + x * 3] = rnd();
      raw[row + 2 + x * 3] = rnd();
      raw[row + 3 + x * 3] = rnd();
    }
  }
  const idat = zlib.deflateSync(raw, { level: 1 });
  const chunk = (type, data) => {
    const buf = Buffer.alloc(12 + data.length);
    buf.writeUInt32BE(data.length, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    buf.writeUInt32BE(zlib.crc32(buf.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
    return buf;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PDF with one full-page scanned-photo-like image per page (for compression). */
async function makeImagePdf(name, pageCount, pngPath) {
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(await readFile(pngPath));
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  }
  await writeFile(join(TMP, name), await doc.save());
  return join(TMP, name);
}

async function makePdf(name, pageCount, label) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const colors = [[0.93, 0.95, 1], [0.94, 1, 0.95], [1, 0.96, 0.9], [0.98, 0.93, 1]];
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595, 842]);
    const [r, g, b] = colors[i % colors.length];
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(r, g, b) });
    page.drawText(`${label} — Page ${i + 1}`, { x: 60, y: 700, size: 28, font, color: rgb(0.2, 0.25, 0.5) });
    page.drawText('DofuPDF guide sample document', { x: 60, y: 660, size: 14, font, color: rgb(0.4, 0.45, 0.6) });
  }
  await writeFile(join(TMP, name), await doc.save());
  return join(TMP, name);
}

/** Encrypted sample via qpdf (locateFile to the package wasm — the proven path). */
async function makeProtectedPdf(sourcePath) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const createQpdf = require('@jspawn/qpdf-wasm/qpdf.js');
  const qpdfWasm = resolve('node_modules/@jspawn/qpdf-wasm/qpdf.wasm');
  // Node's fetch cannot read file paths; serve the wasm bytes from disk
  // (mirrors what a blob URL does in the browser worker).
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === qpdfWasm) {
      const data = await readFile(qpdfWasm);
      return new Response(data, { headers: { 'Content-Type': 'application/wasm' } });
    }
    return origFetch(url);
  };
  let mod;
  try {
    mod = await createQpdf({ noInitialRun: true, locateFile: () => qpdfWasm, print: () => {}, printErr: () => {} });
  } finally {
    globalThis.fetch = origFetch;
  }
  mod.FS.writeFile('in.pdf', new Uint8Array(await readFile(sourcePath)));
  const code = mod.callMain(['--encrypt', 'test1234', 'owner999', '256', '--', 'in.pdf', 'enc.pdf']);
  if (code !== 0 && code !== 3) throw new Error(`qpdf encrypt failed: ${code}`);
  const target = join(TMP, 'protected-sample.pdf');
  await writeFile(target, mod.FS.readFile('enc.pdf'));
  return target;
}

// ---------- static server for ./out ----------

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.wasm': 'application/wasm', '.xml': 'application/xml',
  '.txt': 'text/plain', '.md': 'text/markdown', '.ico': 'image/x-icon',
};

function serve() {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      try {
        let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (path.endsWith('/')) path += 'index.html';
        let file = join(OUT, path);
        if (!existsSync(file) && !extname(path)) file = join(OUT, path, 'index.html');
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(PORT, () => resolveServer(server));
  });
}

// ---------- per-tool scenarios ----------

const READY = '準備ができました';

async function shot(page, guide, step, note) {
  const ready = page.getByText(READY);
  if (await ready.count()) await ready.first().scrollIntoViewIfNeeded();
  else await page.locator('h1').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const dir = join(DEST, guide);
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${step}.png`) });
  console.log(`  ✓ ${guide}/${step}.png (${note})`);
}

async function upload(page, files) {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(files);
  await page.waitForTimeout(1200);
}

async function processAndWait(page, buttonText, resultName, timeoutMs = 90000) {
  await page.getByRole('button', { name: new RegExp(`^${buttonText}$`) }).click();
  await page.getByText(READY).waitFor({ timeout: timeoutMs });
  if (resultName) await page.getByText(resultName).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
}

const scenarios = (s) => [
  {
    tool: 'merge-pdf', guide: 'how-to-merge-pdf', steps: [
      ['step-1', async (p) => upload(p, [s.pdfA, s.pdfB, s.pdfC]), 'three files added'],
      ['step-2', async (p) => processAndWait(p, 'PDFを結合', 'merged.pdf'), 'download card'],
    ],
  },
  {
    tool: 'split-pdf', guide: 'how-to-split-pdf', steps: [
      ['step-1', async (p) => upload(p, [s.pdfA]), 'file added'],
      ['step-2', async (p) => processAndWait(p, 'PDFを分割', 'split.zip'), 'zip download card'],
    ],
  },
  {
    tool: 'compress-pdf', guide: 'how-to-compress-pdf', steps: [
      ['step-1', async (p) => upload(p, [s.pdfBig]), 'scan-like file added, levels visible'],
      ['step-2', async (p) => processAndWait(p, 'PDFを圧縮', 'compressed.pdf', 300000), 'compression result'],
    ],
  },
  {
    tool: 'rotate-pdf', guide: 'how-to-rotate-pdf', steps: [
      ['step-1', async (p) => upload(p, [s.pdfA]), 'file added'],
      ['step-2', async (p) => processAndWait(p, 'PDFを回転', 'rotated.pdf'), 'download card'],
    ],
  },
  {
    tool: 'organize-pdf', guide: 'how-to-organize-pdf-pages', steps: [
      ['step-1', async (p) => { await upload(p, [s.pdfA]); await p.locator('img[src^="data:image"]').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1500); }, 'thumbnail grid'],
      ['step-2', async (p) => processAndWait(p, '整理済みPDFをダウンロード', 'organized.pdf'), 'download card'],
    ],
  },
  {
    tool: 'pdf-to-jpg', guide: 'how-to-convert-pdf-to-jpg', steps: [
      ['step-1', async (p) => upload(p, [s.pdfA]), 'file added'],
      ['step-2', async (p) => processAndWait(p, '画像に変換', 'images.zip'), 'zip download card'],
    ],
  },
  {
    tool: 'jpg-to-pdf', guide: 'how-to-convert-jpg-to-pdf', steps: [
      ['step-1', async (p) => upload(p, [s.photo1, s.photo2]), 'two photos added'],
      ['step-2', async (p) => processAndWait(p, 'PDFに変換', 'images.pdf'), 'download card'],
    ],
  },
  {
    tool: 'protect-pdf', guide: 'how-to-password-protect-pdf', steps: [
      ['step-1', async (p) => { await upload(p, [s.pdfA]); await p.locator('input[type="password"]').first().fill('demo1234'); await p.locator('input[type="password"]').nth(1).fill('demo1234'); }, 'password filled'],
      ['step-2', async (p) => processAndWait(p, 'PDFを保護', 'protected.pdf', 120000), 'download card'],
    ],
  },
  {
    tool: 'unlock-pdf', guide: 'how-to-unlock-pdf', steps: [
      ['step-1', async (p) => { await upload(p, [s.protectedPdf]); await p.locator('input[type="password"]').first().fill('test1234'); }, 'protected file + password'],
      ['step-2', async (p) => processAndWait(p, 'PDFをロック解除', 'unlocked.pdf', 120000), 'download card'],
    ],
  },
  {
    tool: 'watermark-pdf', guide: 'how-to-add-watermark-to-pdf', steps: [
      ['step-1', async (p) => { await upload(p, [s.pdfA]); const t = p.locator('input[type="text"]').first(); if (await t.count()) await t.fill('機密'); }, 'text watermark options'],
      ['step-2', async (p) => processAndWait(p, '透かしを追加', 'watermarked.pdf'), 'download card'],
    ],
  },
  {
    tool: 'page-numbers', guide: 'how-to-add-page-numbers-to-pdf', steps: [
      ['step-1', async (p) => upload(p, [s.pdfA]), 'file added'],
      ['step-2', async (p) => processAndWait(p, 'ページ番号を追加', 'numbered.pdf'), 'download card'],
    ],
  },
  {
    tool: 'pdf-to-markdown', guide: 'how-to-convert-pdf-to-markdown', steps: [
      ['step-1', async (p) => upload(p, [s.pdfA]), 'file added'],
      ['step-2', async (p) => processAndWait(p, 'Markdownに変換', 'download.md'), 'download card'],
    ],
  },
];

// ---------- main ----------

await mkdir(TMP, { recursive: true });
const samples = {
  pdfA: await makePdf('sample-a.pdf', 4, 'Annual Report'),
  pdfB: await makePdf('sample-b.pdf', 2, 'Contract'),
  pdfC: await makePdf('sample-c.pdf', 2, 'Appendix'),
  photo1: join(TMP, 'photo-1.png'),
  photo2: join(TMP, 'photo-2.png'),
};
await writeFile(samples.photo1, solidPng(900, 600, [99, 132, 226]));
await writeFile(samples.photo2, solidPng(600, 900, [236, 140, 105]));
const scanImage = join(TMP, 'scan-page.png');
await writeFile(scanImage, noisePng(1600, 2000));
samples.pdfBig = await makeImagePdf('sample-big.pdf', 3, scanImage);
samples.protectedPdf = await makeProtectedPdf(samples.pdfB);

const server = await serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 780 }, deviceScaleFactor: 1.5 });
page.on('pageerror', () => {});

let failures = 0;
for (const sc of scenarios(samples)) {
  console.log(`▶ ${sc.tool}`);
  try {
    await page.goto(`http://localhost:${PORT}/${sc.tool}/`, { waitUntil: 'networkidle' });
    for (const [step, action, note] of sc.steps) {
      await action(page);
      await shot(page, sc.guide, step, note);
    }
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${sc.tool} failed: ${String(err).split('\n')[0]}`);
  }
}

await browser.close();
server.close();
console.log(failures === 0 ? 'ALL SCREENSHOTS CAPTURED' : `${failures} tool(s) failed`);
process.exit(failures === 0 ? 0 : 1);
