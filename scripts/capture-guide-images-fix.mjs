/**
 * Second pass: re-capture the scenes whose alt texts describe specific UI
 * states (options panels, typed inputs, per-tile actions) rather than the
 * generic file-added/result shots from the first pass.
 * Run: node scripts/capture-guide-images-fix.mjs (after capture-guide-images.mjs)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import zlib from 'node:zlib';

const OUT = resolve('out');
const DEST = resolve('public/guides');
const TMP = resolve('tmp-guide-shots');
const PORT = 4897;

function solidPng(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
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

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.wasm': 'application/wasm', '.xml': 'application/xml', '.txt': 'text/plain',
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
        res.end();
      }
    });
    server.listen(PORT, () => resolveServer(server));
  });
}

async function main() {
  // extra sample images
  await mkdir(TMP, { recursive: true });
  const photos = ['photo-1.png', 'photo-2.png', 'photo-3.png', 'photo-4.png'].map((n) => join(TMP, n));
  await writeFile(photos[2], solidPng(900, 600, [96, 190, 140]));
  await writeFile(photos[3], solidPng(600, 900, [180, 120, 200]));
  const logo = join(TMP, 'logo.png');
  await writeFile(logo, solidPng(500, 500, [220, 60, 60]));

  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1120, height: 780 }, deviceScaleFactor: 1.5 });

  const shotViewport = async (guide, step, scrollTarget, note) => {
    if (scrollTarget) await scrollTarget.scrollIntoViewIfNeeded();
    else await page.locator('h1').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(DEST, guide, `${step}.png`) });
    console.log(`  ✓ ${guide}/${step}.png (${note})`);
  };
  const upload = async (files) => {
    await page.locator('input[type="file"]').first().setInputFiles(files);
    await page.waitForTimeout(1200);
  };
  const gotoTool = async (tool) => {
    await page.goto(`http://localhost:${PORT}/${tool}/`, { waitUntil: 'networkidle' });
  };

  let failures = 0;
  const run = (name, fn) => fn().catch((e) => { failures += 1; console.error(`  ✗ ${name}: ${String(e).split('\n')[0]}`); });

  // rotate step-1: scope = Selected pages only, pages filled
  await run('rotate step-1', async () => {
    await gotoTool('rotate-pdf');
    await upload([join(TMP, 'sample-a.pdf')]);
    await page.getByLabel('選んだページだけ').click();
    await page.locator('input[type="text"]').first().fill('1, 3, 5-8');
    await shotViewport('how-to-rotate-pdf', 'step-1', page.locator('input[type="text"]').first(), 'options with range filled');
  });

  // pdf-to-markdown step-1: Selected pages only + range typed
  await run('markdown step-1', async () => {
    await gotoTool('pdf-to-markdown');
    await upload([join(TMP, 'sample-a.pdf')]);
    await page.getByText('選択したページのみ').click();
    await page.locator('input[type="text"]').first().fill('1-3, 5');
    await shotViewport('how-to-convert-pdf-to-markdown', 'step-1', page.locator('input[type="text"]').first(), 'range typed');
  });

  // jpg-to-pdf step-1: four images added
  await run('jpg-to-pdf step-1', async () => {
    await gotoTool('jpg-to-pdf');
    await upload(photos);
    await shotViewport('how-to-convert-jpg-to-pdf', 'step-1', null, 'four images added');
  });

  // jpg-to-pdf step-2: options panel (orientation + placement selects)
  await run('jpg-to-pdf step-2', async () => {
    const orientation = page.getByText('ページ方向').first();
    await shotViewport('how-to-convert-jpg-to-pdf', 'step-2', orientation, 'options panel');
  });

  // watermark step-2: image watermark options with logo added
  await run('watermark step-2', async () => {
    await gotoTool('watermark-pdf');
    await upload([join(TMP, 'sample-a.pdf')]);
    await page.getByText('画像（PNGまたはJPG）').click();
    await page.waitForTimeout(400);
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(1).setInputFiles(logo);
    await page.waitForTimeout(600);
    await shotViewport('how-to-add-watermark-to-pdf', 'step-2', page.getByText('画像サイズ（ページ幅基準）').first(), 'image watermark options');
  });

  // protect step-2: permissions panel in default state
  await run('protect step-2', async () => {
    await gotoTool('protect-pdf');
    await upload([join(TMP, 'sample-a.pdf')]);
    await shotViewport('how-to-password-protect-pdf', 'step-2', page.getByText('印刷', { exact: true }).first(), 'permissions panel');
  });

  // organize step-2: one tile rotated, one deleted (grid close-up)
  await run('organize step-2', async () => {
    await gotoTool('organize-pdf');
    await upload([join(TMP, 'sample-a.pdf')]);
    await page.locator('img[src^="data:image"]').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'ページを90°回転' }).first().click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'ページを削除' }).nth(1).click();
    await page.waitForTimeout(600);
    const grid = page.locator('img[src^="data:image"]').first().locator('xpath=ancestor-or-self::*[contains(@class,"grid")][1]');
    if (await grid.count()) {
      await grid.screenshot({ path: join(DEST, 'how-to-organize-pdf-pages', 'step-2.png') });
      console.log('  ✓ how-to-organize-pdf-pages/step-2.png (grid close-up)');
    } else {
      await shotViewport('how-to-organize-pdf-pages', 'step-2', page.locator('img[src^="data:image"]').first(), 'grid fallback');
    }
  });

  await browser.close();
  server.close();
  console.log(failures === 0 ? 'ALL FIX SHOTS CAPTURED' : `${failures} scene(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
