# DofuPDF

**Free PDF tools that respect your privacy.** DofuPDF is a privacy-first, 100% client-side PDF toolkit for the web — think ilovepdf.com, except your files never leave your device. All PDF processing runs in the browser (WebAssembly / Web Workers); there is no backend at all.

Live site: <https://dofupdf.com> (Japanese-language interface, targeted at users in Japan)

## The three pillars

- **No Uploads** — your files never leave your device. Every tool runs locally in your browser.
- **No Sign-Up** — no account, no email address, no personal information. Ever.
- **Free Forever** — every tool is free with no usage limits, funded by unobtrusive ads.

Don't take our word for it: disconnect from the internet after a page loads and the tools still work; watch the Network tab in DevTools and see zero file uploads; audit the source code — it's open source (AGPL-3.0).

## Tools

All 26 tools run 100% locally in your browser — no uploads, no sign-up, free forever. Browse them by category at [/tools/](https://dofupdf.com/tools/):

- **Merge PDF** — combine multiple PDFs into a single file, in the order you want
- **Split PDF** — extract a page range or split one PDF into separate documents
- **Compress PDF** — shrink the file size while keeping the quality you need
- **Rotate PDF** — rotate single pages or an entire document in seconds
- **Organize PDF** — reorder, delete, and rearrange pages with drag and drop
- **Remove Pages** — delete unwanted pages from a PDF with a visual page picker
- **Extract Pages** — save selected pages of a PDF as a new document
- **Reorder Pages** — drag pages into exactly the order you want
- **PDF to JPG** — turn each PDF page into a high-quality JPG image
- **JPG to PDF** — convert JPG images into a clean, shareable PDF document
- **HEIC to PDF** — turn iPhone HEIC photos into a clean, shareable PDF document
- **Extract Images** — pull every embedded image out of a PDF as JPG/PNG files
- **Protect PDF** — add AES-256 password encryption to keep your PDF private
- **Unlock PDF** — remove password protection from PDFs you own
- **Watermark PDF** — stamp a text or image watermark over every page, tiled or centered
- **Page Numbers** — add page numbers to your PDF, exactly where you want them
- **Sign PDF** — draw a signature or upload a photo of it, and place it anywhere on a PDF
- **PDF to Markdown** — extract clean, structured Markdown from any PDF
- **Word to Markdown** — convert .docx documents into clean, AI-ready Markdown
- **Excel to Markdown** — turn spreadsheet sheets into Markdown tables
- **QR Code** — generate QR codes entirely offline
- **OCR PDF** — recognize text in scanned PDFs with Tesseract (English + Japanese)
- **Hanko Seal (押印)** — stamp a Japanese hanko seal image onto PDF pages, with 契印/割り印 (cross-page seal) placement for contracts
- **Invoice Rename (請求書リネーム)** — batch-rename invoice/receipt PDFs into a tidy filing convention, with data read from the documents
- **PDF Check** — pre-submission preflight: searchable text layer, encryption, page size, PDF version and other common rejection reasons, explained in plain Japanese
- **Receipt Sheet (領収書まとめ印刷)** — lay out many receipt/invoice PDF pages on a single A4 sheet for printing, with margins, a binding allowance and optional cut guides

## Tech stack

- **Next.js 15** (App Router, `output: 'export'` static export to `out/`) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS 3.4** — no UI framework, system font stack
- **lucide-react** icons
- Hand-rolled lightweight i18n (no next-intl): **Japanese-only** — `ja` is both the single and the default locale, served at the root path with no prefix
- Heavy PDF work: `@cantoo/pdf-lib`, `pdfjs-dist`, `@jspawn/ghostscript-wasm`, `@jspawn/qpdf-wasm`, `heic-to`, `tesseract.js` — all lazily loaded, all inside Web Workers
- Zero backend: no API routes, no server code, nothing to deploy but static files

## Local development

```bash
npm install          # install dependencies (+ copy wasm/OCR assets into public/)
npm run dev          # dev server on http://localhost:3000
npm run build        # static export to out/
npm run lint         # ESLint (next/core-web-vitals)
npm run type-check   # tsc --noEmit
npm run check:lang   # Japanese copy language gate (no foreign tokens leaking in)
npm run check:copy   # copy baseline guard (scripts/copy-baseline.json)
```

## Deployment (Cloudflare Workers Static Assets)

- **Config:** `wrangler.jsonc` (assets → `./out`), deploy with `npx wrangler deploy` — or just push to `main`: GitHub integration (Cloudflare Workers Builds) auto-deploys
- ⚠️ **Never delete `wrangler.jsonc`**: without it, Wrangler misdetects a full-stack Next.js app and injects the OpenNext adapter, which always fails for a static export
- ⚠️ **Never delete the search-engine verification files** in `public/`: `BingSiteAuth.xml` (Bing Webmaster auth) and `58395c2f24c9698dc16736b1d5933a51.txt` (IndexNow key; deleting it makes IndexNow submissions 403)
- After each deploy: `npm run smoke:live` (48 live checks: redirects, security headers, cache policy, 404s, sitemap URLs). After adding/changing pages: `npm run indexnow` (full submit needs `npm run build` first; Google does not participate in IndexNow — use GSC’s indexing request)
- No environment variables are required. Optional ones (see `.env.example`):
  - `NEXT_PUBLIC_SITE_URL` — canonical URL used for metadata/sitemap (default `https://dofupdf.com`)
  - `NEXT_PUBLIC_GITHUB_URL` — GitHub link target (default `https://github.com/Jimsnote/dofupdf`)
  - `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` — enables the cookieless Cloudflare Web Analytics beacon
  - `NEXT_PUBLIC_ADSENSE_CLIENT` — enables the AdSense ad component
- `public/_headers` sets a strict CSP; `public/_redirects` 301-redirects legacy language-prefixed URLs to the root; `public/sw.js` + `public/manifest.webmanifest` make the site installable and offline-capable

## Project structure

```
src/
├── app/(ja)/               # all routes (root path, Japanese): layout, home, about/privacy/terms/faq,
│                           # 26 tool pages, /tools category index, guides/, compare/
├── app/sitemap.ts          # derived from the live tools in lib/tools.ts — no hardcoding
├── app/robots.ts           # allow all + explicit AI-crawler rules
├── components/
│   ├── layout/             # Header, Footer, SiteShell, ServiceWorkerRegister (no language switcher: single locale)
│   ├── pages/              # shared page bodies + tools/ToolPageScaffold.tsx (SEO copy + 3 JSON-LD blocks)
│   ├── tools/              # ToolShell, FileDropzone, DownloadCard, EngineStatus + per-tool components
│   ├── seo/                # JsonLd, FactSummary (canonical GEO summary)
│   └── ads/                # AdBanner (AdSense placeholder, off unless configured)
├── i18n/
│   ├── config.ts           # locales = ['ja'], defaultLocale, isLocale()
│   ├── get-dictionary.ts
│   └── locales/ja.ts       # the only dictionary — it defines the Dictionary type (structure is the contract)
├── lib/
│   ├── site.ts             # SITE_NAME / SITE_URL / GITHUB_URL / CONTACT_EMAIL (env-overridable)
│   ├── seo.ts              # buildAlternates(), pageMetadata()
│   ├── tools.ts            # tool registry (26 tools, status flags, 6 categories driving the /tools index)
│   ├── guides/             # tutorial content system (21 guides, one data file each)
│   ├── compare/            # competitor comparison pages (dofupdf-vs-ilovepdf / -smallpdf / -sejda)
│   └── pdf/                # pure processing layer (React-free, testable in Node)
└── workers/                # Web Workers for heavy wasm engines
public/
├── llms.txt                # site summary for LLM crawlers
├── logo.svg                # tofu-themed brand mark (also src/app/icon.svg)
└── icons/                  # PWA icons generated from logo.svg by scripts/generate-pwa-icons.mjs
```

## Contributing

Issues and pull requests are welcome on GitHub: <https://github.com/Jimsnote/dofupdf>

## License

DofuPDF is free software licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). See [LICENSE](./LICENSE).
