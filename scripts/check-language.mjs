/**
 * Language QA for the Japanese-only site copy.
 *
 * Flags anything that leaked in from the Korean/original sources or from
 * Simplified-Chinese drafts:
 *   KO    Hangul syllables / jamo
 *   CYR   Cyrillic letters
 *   SIMP  Simplified-Chinese-only glyphs (the same codepoint used as a
 *         Japanese kanji is not flagged — this list is the divergent set)
 *   LAT   a Latin word jammed between CJK/kana without spaces (broken
 *         translation artefacts), unless whitelisted below
 *
 * Run:  node scripts/check-language.mjs [files...]
 *       npm run check:lang            (scans the copy files listed at bottom)
 * Exit code is the number of findings (0 = clean).
 */
import fs from 'fs';
import path from 'path';

const hangul = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
const cyrillic = /[\u0400-\u04FF]/;
const simp = new Set([...'页误关变压缩让从读连续运动继错难员问闻阳阴电东车马鸟鱼门间检简图类释产长总结给绝费严历跃试书买卖权术机杀杂帘执够复盖监无复拟虽邻渊乡织虑虚处众伤伪似' + '质浙泛骤' + '几风云龙极纸语规则样态显报忆拥护适递经过还这时对尔压苏广厂决净观见觉视线负贝责购设证评识讲许议记论详说请实寻导层宪']);
// embedded latin word of len>=3 sandwiched by CJK/kana with optional spaces
const embedRe = /[\u3000-\u30ff\u4e00-\u9fff](?:\s?)([A-Za-z]{3,})(?:\s?)(?=[\u3000-\u30ff\u4e00-\u9fff、。：「」（）])/g;
const allow = new Set([
  'DofuPDF', 'dofupdf', 'Delete', 'Chrome', 'Edge', 'Firefox', 'DRM', 'Safari',
  'PDF', 'DPI', 'MB', 'KB', 'ZIP', 'zip', 'pdf', 'png', 'svg', 'jpg', 'jpeg', 'heic', 'heif', 'gif', 'webp', 'md', 'docx', 'xlsx', 'pptx',
  'markdown', 'Markdown', 'macOS', 'iOS', 'iPhone', 'iPad', 'Wi', 'Adobe', 'Acrobat', 'Ghostscript', 'WebAssembly', 'Wiki', 'Pandoc', 'ChatGPT', 'Claude', 'README', 'Docs', 'GitLab', 'CSV',
  'Tesseract', 'qpdf', 'libheif', 'Word', 'Excel', 'LibreOffice', 'Notion', 'Obsidian', 'GitHub', 'AES', 'OCR', 'QR', 'Helvetica', 'Draw', 'EXIF',
  'NDA', 'A4', 'eIDAS', 'ESIGN', 'Pro', 'Extreme', 'Recommended', 'Light', 'Quartz', 'Print', 'print', 'from', 'to', 'TIFF', 'JPEG', 'GIF', 'HEIC', 'WebP',
  'DIY', 'Microsoft', 'Preview', 'Sheet', 'name', 'https', 'com', 'www', 'png', 'jpg', 'Split', 'Merge', 'Compress', 'Windows', 'Bates', 'iLovePDF', 'API', 'LocalPDF', 'ToolPDFs', 'Sejda', 'PDF24', 'Creator', 'JSON', 'Smallpdf', 'TLS',
  'Protect', 'Unlock', 'Rotate', 'Organize', 'Watermark', 'Sign', 'Extract', 'Remove', 'Convert', 'Cloud', 'Office', 'Web', 'Http', 'Https',
  'preview', 'split', 'merge', 'compress', 'unlock', 'protect', 'rotate', 'organized', 'extracted', 'removed', 'reordered',
  'merged', 'converted', 'compressed', 'watermarked', 'signed', 'protected', 'unlocked', 'example', 'CONFIDENTIAL',
  'Network', 'Cookie', 'Google', 'JavaScript', 'EEA', 'HEVC',
  'removed', 'reordered', 'html', 'json', 'ld', 'data', 'label', 'url', 'slug', 'title', 'description', 'verdict',
]);

/** Copy files scanned when no explicit list is given. */
function defaultFiles() {
  const files = ['src/i18n/locales/ja.ts', 'src/lib/tools.ts', 'src/lib/site.ts'];
  for (const dir of ['src/lib/guides', 'src/lib/compare']) {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.ts')) files.push(path.join(dir, f));
  }
  return files;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : defaultFiles();
let issues = 0;
for (const p of files) {
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const n = i + 1;
    if (hangul.test(l)) { console.log(`KO   ${p}:${n}: ${l.trim().slice(0, 60)}`); issues++; return; }
    if (cyrillic.test(l)) { console.log(`CYR  ${p}:${n}: ${l.trim().slice(0, 60)}`); issues++; }
    for (const ch of l) if (simp.has(ch)) { console.log(`SIMP ${p}:${n} [${ch}]: ${l.trim().slice(0, 60)}`); issues++; break; }
    let m; embedRe.lastIndex = 0;
    while ((m = embedRe.exec(l))) {
      const w = m[1];
      if (!allow.has(w) && !allow.has(w.toLowerCase())) { console.log(`LAT  ${p}:${n} [${w}]`); issues++; }
    }
  });
}
console.log('--- flagged:', issues);
process.exit(issues > 0 ? 1 : 0);
