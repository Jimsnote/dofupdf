# DofuPDF — サーバーへ1バイトも送らない、ブラウザ完結のPDFパスワードツール

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Website](https://img.shields.io/badge/Website-dofupdf.com-2ea44f)](https://dofupdf.com/)

**[DofuPDF](https://dofupdf.com/)** は、ファイルを外部サーバーにアップロードせず、ブラウザ内（WebAssembly）だけでPDFの暗号化・ロック解除が完結するプライバシー重視のPDFセキュリティツールです。契約書、確定申告書類、給与明細、請求書など、外部に送信したくない機密PDFの保護に使われています。

## 🔗 オンラインツール（インストール・登録不要）

* 🏠 [DofuPDF ホーム](https://dofupdf.com/)
* 🔒 [PDFにパスワードを設定する（AES-256暗号化・印刷/コピー/編集制限）](https://dofupdf.com/protect-pdf/)
* 🔓 [PDFロック解除（所有ファイルの保護除去）](https://dofupdf.com/unlock-pdf/)
* 📚 [PDFパスワードのまとめ（ハブ）](https://dofupdf.com/pdf-password/)
* 💳 [料金（単一ファイル永久無料 / Pro買い切り ¥4,980）](https://dofupdf.com/pricing/)

## 仕組み：なぜアップロードが不要なのか

一般的なオンラインPDFツールはファイルをサーバーへ送信して処理します。DofuPDFは逆で、**qpdf / Ghostscript をWebAssemblyとしてブラウザに読み込み、ファイルはユーザーの端末内（RAM上）だけで処理**します。

確認方法は簡単です。

1. [パスワード設定ページ](https://dofupdf.com/protect-pdf/) を開く
2. Wi-Fiをオフにする
3. そのままPDFを選択して処理 → オフラインでも動作します

DevTools（F12 → Network）で観察しても、ファイル送信は0件です。

## 🛠️ 技術スタック

* **Framework:** Next.js 15（App Router / 静的エクスポート）+ TypeScript
* **PDFエンジン:** qpdf / Ghostscript（WebAssembly、ブラウザ内ローカル実行）
* **その他:** pdf-lib、pdfjs-dist、Cloudflare Workers（配信+ライセンスAPI）、KV（ライセンスの端末枠管理）

## 開発

```bash
npm install        # postinstall でWASM/言語パックを public/ に配置
npm run dev        # ローカル開発（http://localhost:3000）
npm run build      # 静的エクスポート（out/）+ 検証
```

テスト・デプロイ、コピーガード（日本語検査）などの運用ルールは [AGENTS.md](./AGENTS.md) を参照してください。

## 📖 ドキュメント（日本語）

* [PDFにパスワードをかける方法（Windows / Mac / スマホ）](https://dofupdf.com/guides/pdf-password-kake-windows/)
* [パスワード変更・解除の手順](https://dofupdf.com/guides/pdf-password-change/)
* [脱PPAP：パスワード付きPDFで送る方法](https://dofupdf.com/guides/ppap-pdf-password/)
* [年末調整の書類を保護する方法](https://dofupdf.com/guides/nenmatsu-chosei-pdf/)
* [請求書PDFの権限設定と電帳法運用](https://dofupdf.com/guides/invoice-seikyusho-pdf-restriction/)
* [社内機密PDFとアップロードしない設計](https://dofupdf.com/guides/company-confidential-pdf-local-tool/)

## ライセンス

GNU Affero General Public License v3.0（AGPL-3.0）。Ghostscript WASM を含むため。
