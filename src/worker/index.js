/**
 * DofuPDF site worker: returns HTTP 410 Gone for the 43 pages retired in the
 * W1 consolidation (all non-password tools and guides), and forwards every
 * other request to the static assets. Static assets win for existing files;
 * this worker only sees requests that would otherwise 404.
 *
 * The list is the single source of truth for the retirement — keep it in
 * sync with src/lib/tools.ts (status 'offline') and src/lib/guides/index.ts.
 */

const GONE_TOOLS = [
  'merge-pdf',
  'split-pdf',
  'compress-pdf',
  'receipt-sheet',
  'rotate-pdf',
  'organize-pdf',
  'remove-pages',
  'extract-pages',
  'reorder-pages',
  'docx-to-markdown',
  'xlsx-to-markdown',
  'extract-images',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'heic-to-pdf',
  'sign-pdf',
  'hanko-pdf',
  'invoice-rename',
  'pdf-check',
  'watermark-pdf',
  'page-numbers',
  'pdf-to-markdown',
  'qr-code',
  'ocr-pdf',
];

const GONE_GUIDES = [
  'how-to-merge-pdf',
  'how-to-split-pdf',
  'how-to-compress-pdf',
  'how-to-rotate-pdf',
  'how-to-organize-pdf-pages',
  'how-to-remove-pages-from-pdf',
  'how-to-extract-pages-from-pdf',
  'how-to-convert-pdf-to-jpg',
  'how-to-convert-jpg-to-pdf',
  'how-to-add-watermark-to-pdf',
  'how-to-add-page-numbers-to-pdf',
  'how-to-print-receipts-on-one-a4',
  'how-to-add-hanko-seal-to-pdf',
  'how-to-rename-invoice-pdfs',
  'how-to-check-pdf-before-submitting',
  'how-to-convert-pdf-to-markdown',
  'how-to-convert-docx-to-markdown',
  'how-to-convert-xlsx-to-markdown',
  '5-pdf-tools-that-dont-upload-your-files',
];

const GONE_PATHS = new Set([
  ...GONE_TOOLS.map((slug) => `/${slug}`),
  ...GONE_GUIDES.map((slug) => `/guides/${slug}`),
]);

const BODY = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>このページは終了しました | DofuPDF</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1e293b; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.7; }
  h1 { font-size: 1.4rem; }
  a { color: #4f46e5; }
</style>
</head>
<body>
<h1>410 — このページは終了しました</h1>
<p>このページは提供を終了しました。DofuPDFは現在、PDFパスワード関連のツールに特化して運営しています。</p>
<p><a href="/">トップページへ</a> ／ <a href="/pdf-password/">PDFパスワードのすべて</a></p>
</body>
</html>
`;

const siteWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 末尾スラッシュと大小を正規化してから照合する
    const path = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    if (GONE_PATHS.has(path)) {
      return new Response(BODY, {
        status: 410,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=86400',
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};

export default siteWorker;
