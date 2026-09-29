#!/usr/bin/env node
/**
 * IndexNow URL 提交脚本（dofupdf.com）
 *
 * 用法：
 *   node scripts/indexnow-submit.mjs                  # 提交 out/sitemap.xml 中的全部 URL（需先 npm run build）
 *   node scripts/indexnow-submit.mjs <url> [url...]   # 只提交指定 URL（新增/更新/删除页面时用）
 *
 * 协议文档：https://www.indexnow.org/documentation
 * key 文件：public/58395c2f24c9698dc16736b1d5933a51.txt
 *   部署后位于 https://dofupdf.com/58395c2f24c9698dc16736b1d5933a51.txt
 *   key 不是机密——搜索引擎靠公网抓取该文件验证站点所有权。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'dofupdf.com';
const KEY = '58395c2f24c9698dc16736b1d5933a51';
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow', // Bing, Yandex, ...
];

const HTTP_STATUS = {
  200: 'OK（提交成功）',
  202: 'Accepted（已接收，key 验证待完成）',
  400: 'Bad request（格式错误）',
  403: 'Forbidden（key 无效，检查 key 文件是否已部署）',
  422: 'Unprocessable Entity（URL 不属于该 host）',
  429: 'Too Many Requests（提交过于频繁）',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getUrlsFromSitemap() {
  const sitemapPath = path.join(__dirname, '..', 'out', 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    console.error('找不到 out/sitemap.xml，请先运行 npm run build；或直接传入要提交的 URL 参数。');
    process.exit(1);
  }
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const args = process.argv.slice(2);
  const urls = args.length > 0 ? args : getUrlsFromSitemap();

  const invalid = urls.filter((u) => !u.startsWith(`https://${HOST}`));
  if (invalid.length > 0) {
    console.error(`以下 URL 不属于 host ${HOST}，拒绝提交：\n  ${invalid.join('\n  ')}`);
    process.exit(1);
  }
  if (urls.length > 10000) {
    console.error('单次最多提交 10000 个 URL');
    process.exit(1);
  }

  console.log(`正在向 IndexNow 提交 ${urls.length} 个 URL...`);
  let ok = true;
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, urlList: urls }),
    });
    const meaning = HTTP_STATUS[res.status] || '未知状态';
    console.log(`${endpoint} → HTTP ${res.status} ${meaning}`);
    if (res.status !== 200 && res.status !== 202) ok = false;
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('提交失败：', err.message);
  process.exit(1);
});
