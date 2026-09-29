# DofuPDF — AI Agent 项目指南

> 本文档面向 AI 编程助手。阅读本文档前，请默认你对本项目一无所知。
> 它的作用是让你在不重读全部历史的情况下，安全、正确地延续开发。
> 站主运维手册见 `docs/PROJECT.md`（中文），任务清单见 `docs/TODO.md`。
> 注意：`docs/` 已在 `.gitignore` 中（内部规划文档不入库），仅在本地维护。

---

## 1. 项目一句话

DofuPDF（品牌沿革：CoolPDF → CPdf → NoriPDF → DofuPDF；2026-09 起转向**日本市场**，与 coolpdf / noripdf 及其旧域名**再无任何关联**）是**面向日本用户的纯浏览器端 PDF 工具站**（类 ilovepdf.com），**零后端**：全部 23 个工具的处理都在浏览器（JS/WASM/Web Worker）完成。核心卖点三支柱（日语固定术语见 `ja.ts`，此处不转写避免错字）：**无上传（文件永不离开设备）/ 免注册 / 永久免费**。变现目标 Google AdSense（未接入，接入清单见 `docs/TODO.md`）。

- **线上**：https://dofupdf.com（Cloudflare Workers Static Assets；www 计划 301 到主域）
- **仓库**：默认指向 `https://github.com/Jimsnote/dofupdf`（**新仓库由站主另行建立**，代码保留 env 覆盖；AGPL-3.0——因压缩用 Ghostscript WASM）
- **域名**：dofupdf.com（旧站 getcoolpdf.com / noripdf.com 与本项目无关，不为其做任何兼容）
- **联系邮箱**：support@dofupdf.com

## 2. 技术栈与硬约束

- Next.js 15（App Router，`output: 'export'` 静态导出到 `out/`）+ React 19 + TypeScript **strict** + Tailwind 3.4
- Node 22（`.nvmrc` + `engines: >=20 <23`，勿升级换大版本）
- 日语单语 i18n：**ja 为唯一语言兼默认语言，全部页面在根路径（无前缀）**；route group 单根布局 `src/app/(ja)/`（`<html lang="ja">`）。`public/_redirects` 把历史语言前缀 URL（`/de/ /fr/ /it/ /es/ /pt/ /zh/ /ja/`）301 到无前缀根路径
- 核心库：`@cantoo/pdf-lib`（页面对象操作，**必须经 `src/lib/pdf/pdf-lib.ts` 的 `getPdfLib()` 动态 import，禁止静态 import 进首屏**）、`pdfjs-dist` v6（渲染/文本提取，懒加载经 `src/lib/pdf/pdfjs.ts`）、`@jspawn/ghostscript-wasm` + `@jspawn/qpdf-wasm`（Worker 内）、`heic-to/csp`（HEIC 解码，**LGPL-3.0**，libheif wasm 内嵌、blob URL 起 Worker，零 eval 过 CSP，懒加载）、jszip、@dnd-kit
- OCR：tesseract.js，语种固定 `['eng', 'jpn']` 双语种识别（`src/lib/pdf/ocr.ts`）
- 部署：`wrangler.jsonc`（assets → ./out）+ Deploy command `npx wrangler deploy`；`public/_headers`（CSP）；`scripts/copy-wasm.mjs`（postinstall+prebuild 生成 `public/wasm/`（含 manifest.json）与 `public/tesseract/`（OCR 引擎/语言包），两目录均 gitignore）
- PWA：`public/sw.js`（Service Worker，访问过的页面与静态资源离线可用）+ `public/manifest.webmanifest` + `src/components/layout/ServiceWorkerRegister.tsx`（仅生产注册）；图标由 `scripts/generate-pwa-icons.mjs`（Playwright 渲染 `public/logo.svg`）生成 `public/icons/icon-192.png` / `icon-512.png` / `icon-512-maskable.png`

## 3. 血泪教训（改动相关代码前必读）

1. **jspawn 的 Emscripten 构建忽略 `wasmBinary` 配置**——二进制永远 `fetch(locateFile 的 URL)`。正确做法：预取字节（带进度 + Cache Storage）→ 生成 blob URL → 传给 `locateFile`（见 `src/workers/pdf-heavy.worker.ts` 的 `engineBlobUrl()`）。不要回退到传 wasmBinary。
2. **CSP 每加一个浏览器能力都要同步审**：内联 hydration 脚本要求 `script-src 'unsafe-inline'`（否则全站白屏，React 无法水合）；wasm blob 加载要求 `connect-src` 含 `blob:`。隐私强制点是 `connect-src 'self' blob:`（禁止数据外发），它不可再放宽（AdSense/Analytics 除外，见 _headers 注释）。
3. **范围输入已做归一化**（`src/lib/pdf/page-ranges.ts`）：中文逗号/顿号/分号、全角破折号/数字、尾随逗号容错。不要绕过 `normalizeRangeInput`。
4. **工具组件处理开始时必须 `setResult(null)`**：否则处理失败后旧结果卡残留，用户会下载到上一个任务的文件（真实事故）。
5. **jpg-to-pdf 的 EXIF 方向**：必须经 `src/lib/pdf/image-orientation.ts` 矫正，否则手机竖拍照片侧躺 90°。
6. **route group 现为单根 `(ja)/`**；`src/app/` 根下只剩 sitemap.ts/robots.ts/global-not-found.tsx/icon.svg/globals.css。移动页面目录后必须重启 dev server 并删 `.next`（stale 的 `.next/types/validator.ts` 会让 type-check 报已删除路由的错）。**dev 跑着时绝不可并发 `npm run build`**：build 覆写 `.next`，全站会不水合（`main-app.js` 404，页面变静态壳），build 后回到 dev 也是坏状态——正确顺序是先杀 dev（`netstat -ano` 拿 3000 端口的 PID；sandbox 下 `Get-NetTCPConnection` 常常查不到），再 build，然后删 `.next` 重启 dev。
7. **sitemap.ts/robots.ts 需 `export const dynamic = 'force-static'`**（Next 15 静态导出要求）。
8. **TS 5.7+ 的 `Uint8Array` 不能直接赋给 `BlobPart`**——统一用 `src/components/tools/blob.ts` 的 `pdfBlob()`。
9. **Windows + Node 22 特有**：postcss.config.js 必须 CommonJS；不用 next/font/google（用系统字体栈）；Node 下跑 pdf.js 测试需 DOMMatrix 等 polyfill（仅测试环境）。
10. **Cloudflare 控制台已无独立 Pages 流程**（并入 Workers）：没有 `wrangler.jsonc` 时 wrangler 会自动套 OpenNext 全栈适配器，静态导出项目必崩。`wrangler.jsonc` 不可删。
11. **AI 生成日语正文极易混入其它语种 token**（本仓实测：英语 Among/often、韩语 잘/많/본 泄漏进译文）——每写完一篇必须过 `scripts/_qa.mjs` 扫描（见 §5）。
12. **`@cantoo/pdf-lib` 的 `embedPdf` 有三个 silent 坑**（`src/lib/pdf/receipt-sheet.ts` 实测踩过）：① 页面嵌入器完全不读源页 `/Rotate`，方向必须由调用方自己读取并施加，**而且要把符号取反**：`/Rotate` 是阅读器**顺时针**旋转，pdf-lib 的 `rotate`/`degrees()` 是**逆时针**，直接用 `degrees(rotation)` 会把扫描件排成上下颠倒 180°（已在 Chrome 阅读器对照实测佐证）——正确写法是 `angle = (360 - rotation) % 360`；② `drawPage` 的算子序列是 `translate → rotate → scale`，即**绕 (x, y) 原点旋转**而非绕中心，想按中心摆放必须反解原点（与 `watermark.ts` 的 `drawStampCentered` 同一套公式）；③ 无 `/Contents` 的空白页只在 `save()` 真正构建 XObject 时才抛 `MissingPageContentsEmbeddingError`，用 try/catch 包住 `embedPdf` 无效——必须在嵌入前用 `page.node.normalizedEntries().Contents` 预检，缺内容流的页先 `pushOperators(pushGraphicsState(), popGraphicsState())` 补一条合法空流。另外，逐页调 `embedPage` 会每页新建 `PDFObjectCopier`，共享字体/图片被重复拷贝导致输出膨胀，**每个源文档只做一次批量 `embedPdf`**。
13. **pdf-lib `save()` 会 deflate 压缩内容流**，因此“拉出字节 grep `cm` 矩阵”验证旋转方向这条路走不通（本次实测 grep 命中 0）——方向类正确性只能在浏览器里跟 Chrome 阅读器对照，或者读渲染后的 DOM/SVG 几何值。反过来，**预览图不要自己另算一套几何**：`receipt-sheet` 的预览直接用引擎的 `sheetCells()` + `computePlacements()` 画 SVG，数字与成品同源，天然不会出现“预览好看、成品走样”（已逐点比对，误差 <0.01pt）。

## 4. 代码结构速查

```
src/
├── app/(ja)/            # 全部页面（根路径，日语）：layout/not-found + 5 内容页 + 23 工具页 + guides/compare
├── app/sitemap.ts       # 由 tools.ts 的 live 工具派生，勿硬编码；无 lastmod（刻意）
├── app/robots.ts        # 放行 AI 爬虫（GPTBot/ClaudeBot/PerplexityBot 等）
├── components/
│   ├── layout/          # Header/Footer/SiteShell/AnalyticsScript（无语言切换器，单语站）
│   ├── pages/           # 页面共享组件（路由文件只做薄封装）
│   ├── pages/tools/ToolPageScaffold.tsx  # 工具页骨架（SEO 内容 + 三层 JSON-LD）
│   ├── tools/           # ToolShell/FileDropzone/DownloadCard/EngineStatus + 工具组件
│   ├── seo/             # JsonLd / FactSummary（GEO 定型文案）
│   └── ads/AdBanner.tsx # 未放置；env 控制
├── i18n/locales/ja.ts   # 唯一字典，**Dictionary 类型源头**（`export type Dictionary = typeof ja`，结构即契约）
├── lib/site.ts          # SITE_NAME='DofuPDF' / SITE_URL（默认 https://dofupdf.com）/ GITHUB_URL / CONTACT_EMAIL（support@dofupdf.com，CF Email Routing 转发）
├── lib/seo.ts           # buildAlternates / pageMetadata / localizedPath / OG_IMAGE_URL
├── lib/tools.ts         # 23 工具注册表（slug/图标/status；HWP/HWPX 两个工具已整体下线，渲染器与内嵌字体文件已删除）
├── lib/guides/          # 教程内容系统（日语）：types.ts + index.ts 注册表 + 18 个 <slug>.ts 数据文件
├── lib/compare/         # 竞品对比页（日语）：dofupdf-vs-ilovepdf / -smallpdf / -sejda
└── lib/pdf/             # 纯函数处理层（与 React 解耦，Node 可测）
```

**教程（Guides）系统**：教程页在 `src/app/(ja)/guides/`（日语，无 hreflang），由 `src/components/pages/guides/GuidePage.tsx` 渲染数据文件。新增教程：在 `src/lib/guides/` 加数据文件（结构见 `how-to-merge-pdf.ts` exemplar，正文链接用 `[label](/path/)` 语法，站内相对路径带尾斜杠）→ 在 `index.ts` 注册（sitemap/索引页/工具页互链自动生效）。截图由 `scripts/capture-guide-images.mjs`（+ `*-fix.mjs`）用 Playwright 对 `out/` 实拍生成，存 `public/guides/<slug>/`；改图后必须核对数据文件里的 alt 与画面一致。

## 5. 工作约定

- **新增工具**：`lib/pdf/` 纯函数 → `components/tools/` 组件 → ToolPageScaffold 加 slug → `(ja)/` 加薄路由 → `ja.ts` 加 `toolPages` 条目（**只增不改既有 key**，它是类型源头）→ `tools.ts` 置 live → 验证 → Node 实测核心逻辑
- **日语文案**：`ja.ts` 是唯一字典，key/结构/数组长度即全站类型契约；metaTitle ≤60 字符、metaDescription ≤160；工具名/三支柱等固定术语以 `ja.ts` 既有译法为准。**血泪教训（原韩语语境同款适用）：AI 生成日语时长段落极易夹带其它语种词或造出非词汇的假名/汉字组合**，写入后必须跑机械校验：`node scripts/_qa.mjs <file…>`（扫描 hangul / 西里尔 / 简体特用字 / 夹在 CJK 之间的拉丁词，白名单在脚本内）；PowerShell 下批量用 `Get-ChildItem … | ForEach-Object FullName` 展开通配符后 `node scripts/_qa.mjs @files`。**绝不用手打 CJK 做 SearchReplace**（匹配不上就 Read 取精确原文，或改用最短唯一子串）。
- **文件读写**：含 CJK 的文件一律用 Read/SearchReplace/Write 或 Node 处理；PowerShell 读写会损坏 UTF-8。`node -e` 的内联引号会被 PowerShell 破坏，复杂逻辑写成 `.mjs` 再 `node` 运行。
- **验证三件套**（提交前必跑）：`npm run type-check` / `npm run lint` / `npm run build`
- **测试**：无测试框架；核心逻辑用临时 Node 脚本实测（用后删除）。CJS 模式编译（`tsc --module commonjs`）再 require，避免 ESM 路径坑
- **git**：main 分支，英文 commit message；用户已授权本地 commit；**push 前必须经用户确认**（GitHub Desktop 由用户操作）
- **许可**：AGPL-3.0；新增第三方依赖时核对许可证（优先 MIT/Apache；GPL 系引入即传染）

## 6. 环境变量（均构建期内联，无敏感信息）

`NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_GITHUB_URL`（默认 https://github.com/Jimsnote/dofupdf，新仓库待建）/ `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`（Cloudflare 控制台自动注入已开，此变量未用）/ `NEXT_PUBLIC_ADSENSE_CLIENT`（未启用，AdSense 审核通过后配置）

> 2026-08：Microsoft Clarity 已移除（代码、CSP、隐私文案同步清理），站点只保留 CF 无 Cookie 汇总统计，走"零行为追踪"叙事。

## 7. 当前状态与下一步

- 已完成：M1-M4 工具全量 + SEO/GEO 基建；三路对抗审查 + 两批修复闭环；siritools 对标批次①-④（上传计数器、FAQ 首句加粗、工具链推荐、PWA、QR 码、OCR）
- 新增 2026-09：**转向日本市场 + 品牌更名 DofuPDF（dofupdf.com）**——删除韩语字典与 `(ko)` 路由组、新建 `ja.ts` 全量日语字典、路由组改 `(ja)`、17 篇 guides 与 3 篇 compare 全量重命名为 `dofupdf-vs-*` 并译成日语、OCR 语种 eng+kor → **eng+jpn**、HWP/HWPX 两个工具**整体下线**（注册表条目、渲染器 `hwpx-parse/hwpx-render`、内嵌韩文字体与相关依赖均已删除）、豆腐主题 logo（`public/logo.svg` / `src/app/icon.svg`）与 PWA PNG 图标重制、llms.txt/_redirects/manifest/sitemap 等 SEO 资产同步；`npm run build` 静态导出通过（51 页），全库韩文/简体残留扫描为 0
- 进行中/待办：`docs/TODO.md`（Search Console / Google 検索コンソール・索引提交 → 养收录 → AdSense；GitHub 新仓库待站主建立；二期：证件照排版、OCR 更多语言）
- 已知限制：文字水印 canvas 路径、EXIF 重编码路径未经 Node 测试（浏览器已人工验收）；qpdf AES-256 下 accessibility 权限不生效（规范行为，FAQ 已说明）
