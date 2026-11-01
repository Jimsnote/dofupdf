[日本語のREADMEはこちら](./README.ja.md)

# DofuPDF

**PDF password security that runs entirely in your browser.** DofuPDF is a privacy-first PDF password tool for the Japanese market: protect and unlock PDFs with AES-256 encryption without your files ever leaving your device. Single-file protect/unlock is free with no usage limits; batch processing is a one-time Pro purchase.

Live site: <https://dofupdf.com> (Japanese-language interface, targeted at users in Japan)

## What makes it different

- **No Uploads** — PDF processing runs locally in your browser (WebAssembly / Web Workers). Your files never leave your device.
- **No Sign-Up** — no account, no email address to use the free tier. Ever.
- **Free for individual files, forever** — single-file protect/unlock is free with no limits or watermarks. Batch processing (4+ files at once) requires DofuPDF Pro.

Don't take our word for it: disconnect from the internet after a page loads and the tools still work; watch the Network tab in DevTools and see zero file uploads; audit the source code — it's open source (AGPL-3.0).

## Tools

The live site is focused on PDF password protection:

- **Protect PDF** — add AES-256 password encryption, with optional restrictions on printing / copying / editing
- **Unlock PDF** — remove password protection from PDFs you own
- **PDFパスワード hub** — [/pdf-password/](https://dofupdf.com/pdf-password/) central page linking the tools and every password guide

### DofuPDF Pro

Batch mode is a one-time purchase (**¥4,980**, no subscription, sold via [Payhip](https://payhip.com/b/8fZxV)):

- Up to 50 files per batch (free tier: up to 3)
- Batch protect, batch unlock, batch password change
- Batch output renaming + processing log CSV
- License key valid on up to 3 devices

Activation calls a minimal license-verification API — the only network calls the site makes. PDF files and passwords never touch the network.

### Retired tools

The site previously shipped 24 additional tools (merge, split, compress, OCR, hanko stamp, and more). They were retired with HTTP 410 in an October 2026 focus pass; the code is preserved in `src/offline-pages/` and each tool can be restored. `src/worker/index.js` holds the single source of truth for the retired URL list.

## Tech stack

- **Next.js 15** (App Router, `output: 'export'` static export to `out/`) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS 3.4** — no UI framework, system font stack
- Hand-rolled lightweight i18n (no next-intl): **Japanese-only** — `ja` is both the single and the default locale, served at the root path with no prefix
- PDF engine: `@jspawn/qpdf-wasm` inside Web Workers (AES-256); `@cantoo/pdf-lib`, `pdfjs-dist`, `tesseract.js` etc. remain in the tree for the retired tools
- **Cloudflare Workers Static Assets** + a small site Worker (`src/worker/index.js`): answers 410 for retired URLs and proxies the license API (`/api/license/activate|validate|deactivate`) backed by a `LICENSE_KV` namespace
- No file-processing backend: PDFs are processed in the browser; the only server-side state is license activations

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

Without `PAYHIP_PRODUCT_SECRET` configured, the license API runs in DEMO mode and accepts the key `DEMO-PRO-0000-0000` (response header `X-License-Mode: demo`).

## Deployment (Cloudflare Workers Static Assets)

- **Config:** `wrangler.jsonc` (assets → `./out`, `main: src/worker/index.js`), deploy with `npx wrangler deploy` — or just push to `main`: GitHub integration (Cloudflare Workers Builds) auto-deploys
- ⚠️ **Never delete `wrangler.jsonc`**: without it, Wrangler misdetects a full-stack Next.js app and injects the OpenNext adapter, which always fails for a static export
- ⚠️ **Never delete the search-engine verification files** in `public/`: `BingSiteAuth.xml` (Bing Webmaster auth) and `58395c2f24c9698dc16736b1d5933a51.txt` (IndexNow key; deleting it makes IndexNow submissions 403)
- Cloudflare Dashboard configuration: `PAYHIP_PRODUCT_SECRET` (secret, for license verification) and the `LICENSE_KV` namespace binding (standard)
- Build-time environment variables (all optional, see `.env.example`):
  - `NEXT_PUBLIC_SITE_URL` — canonical URL used for metadata/sitemap (default `https://dofupdf.com`)
  - `NEXT_PUBLIC_GITHUB_URL` — GitHub link target (default `https://github.com/Jimsnote/dofupdf`)
  - `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` — enables the cookieless Cloudflare Web Analytics beacon
  - `NEXT_PUBLIC_ADSENSE_CLIENT` — enables the AdSense ad component (not currently in use)
- After each deploy: `npm run smoke:live` (live checks: redirects, security headers, cache policy, 404s, sitemap URLs). After adding/changing pages: `npm run indexnow` (full submit needs `npm run build` first; Google does not participate in IndexNow — use GSC's indexing request)
- `public/_headers` sets a strict CSP; `public/_redirects` 301-redirects legacy language-prefixed URLs to the root; `public/sw.js` + `public/manifest.webmanifest` make the site installable and offline-capable

## Project structure

```
src/
├── app/(ja)/               # live pages (root path, Japanese): home, protect-pdf, unlock-pdf,
│                           # pdf-password hub, pricing, tokushoho (commerce-law page),
│                           # about/faq/privacy/terms, tools/guides/compare indexes
├── offline-pages/          # 24 retired tool routes (not compiled, not generated; kept for restore)
├── worker/index.js         # site Worker (wrangler main): 410 for retired URLs + license API
├── app/sitemap.ts          # derived from the live tools/guides in lib — no hardcoding
├── app/robots.ts           # allow all + explicit AI-crawler rules
├── components/
│   ├── layout/             # Header, Footer, SiteShell, ServiceWorkerRegister (single locale)
│   ├── pages/              # shared page bodies + tools/ToolPageScaffold.tsx (SEO copy + JSON-LD)
│   ├── tools/              # ToolShell, FileDropzone, DownloadCard, EngineStatus + tool components
│   ├── seo/                # JsonLd, FactSummary (canonical GEO summary)
│   └── ads/                # AdBanner (AdSense placeholder, off unless configured)
├── i18n/
│   ├── config.ts           # locales = ['ja'], defaultLocale, isLocale()
│   ├── get-dictionary.ts
│   └── locales/ja.ts       # the only dictionary — it defines the Dictionary type (structure is the contract)
├── lib/
│   ├── site.ts             # SITE_NAME / SITE_URL / GITHUB_URL / CONTACT_EMAIL (env-overridable)
│   ├── seo.ts              # buildAlternates(), pageMetadata()
│   ├── tools.ts            # tool registry (2 live + 24 offline, status flags)
│   ├── guides/             # guide content system (15 live guides; retired data files kept unregistered)
│   ├── compare/            # 3 competitor comparison pages (ilovepdf / smallpdf / sejda)
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
