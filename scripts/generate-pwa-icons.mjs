#!/usr/bin/env node
/**
 * 从 public/logo.svg 生成 PWA 图标 PNG（Playwright 实拍）：
 * - public/icons/icon-192.png / icon-512.png（purpose: any）
 * - public/icons/icon-512-maskable.png（内容缩到 80% 安全区，品牌色底）
 *
 * 用法：node scripts/generate-pwa-icons.mjs（改了 logo.svg 后重跑）
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgUrl = pathToFileURL(path.join(root, 'public', 'logo.svg')).href;
const outDir = path.join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto(svgUrl);
    await page.screenshot({
      path: path.join(outDir, `icon-${size}.png`),
      omitBackground: false,
    });
    console.log(`icon-${size}.png`);
  }

  // maskable：logo 缩到 80% 中央安全区，底色填充为品牌色（圆角矩形外也有底）
  // 先回到 HTML 文档（前面 goto 过 SVG，当前 document 不是 HTML，setContent 会报错）；
  // SVG 内联嵌入——file:// 子资源在 about:blank 页面里会被 Chromium 拦截
  const svgMarkup = readFileSync(path.join(root, 'public', 'logo.svg'), 'utf8');
  await page.goto('about:blank');
  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:512px;height:512px;background:#4f46e5;display:flex;align-items:center;justify-content:center"><div style="width:410px;height:410px">${svgMarkup}</div></body></html>`);
  await page.screenshot({ path: path.join(outDir, 'icon-512-maskable.png') });
  console.log('icon-512-maskable.png');
} finally {
  await browser.close();
}
