import type { Guide } from './types';

/**
 * Facts below were checked against components/tools/DocxToMarkdownTool.tsx and
 * the toolPages dictionary entries — keep them in sync.
 */
export const howToConvertDocxToMarkdown: Guide = {
  slug: 'how-to-convert-docx-to-markdown',
  toolSlug: 'docx-to-markdown',
  title: 'Word（DOCX）をMarkdownに変換する方法（無料・ローカル処理）',
  description:
    'ステップバイステップ案内：.docxを見栄えのするMarkdownへ変換。見出し、リスト、表、太字／斜体を保持し、すべてブラウザ内でローカル処理。無料、アップロードなし、登録不要。',
  intro:
    'Word文書をMarkdownに変換する最も簡単な方法は、ブラウザでローカルに処理することです。無料の [DOCXをMarkdownへツール](/docx-to-markdown/) を開いて .docx ファイルを置き、「Markdownに変換」をクリックして、結果を download.md としてダウンロードしてください。見出し、リスト、表、太字、斜体、リンクはMarkdownの対応形式のまま保たれ、処理はお使いの端末の中だけで行われます。文書はアップロードされずアカウントも不要で、変換後のMarkdownはObsidianのノート、GitHub README、AIアシスタント入力にそのまま使えます。',
  quickSteps: [
    'DOCXをMarkdownへツールを開き、.docxファイルをドラッグ＆ドロップするかクリックして追加します（古い .doc ファイルは先に .docx へ保存し直す必要があります）。',
    '「Markdownに変換」ボタンをクリックします。文書はブラウザ内で直接解析されて再構築され、たいてい数秒で終わります。',
    '結果カードでダウンロードをクリックすると、download.md として保存されます。',
    'Obsidian、Wiki、GitHub README、AIアシスタントに貼り付けます。',
  ],
  sections: [
    {
      heading: 'ステップバイステップ：DofuPDFで変換する',
      paragraphs: [
        '[DOCXをMarkdownへツール](/docx-to-markdown/) を開きます。インストールも、作るアカウントも不要です。ドロップエリアに .docx ファイルをドラッグするか、クリックしてファイル選択窓から選びます。',
        '「Markdownに変換」をクリックします。文書はブラウザのタブ内で直接読まれて再構築され、所要時間はネット速度ではなく文書の方で決まります。',
        'ダウンロードカードが出たらダウンロードをクリックします。結果は download.md として保存され、元の .docx は絶対に修正されません。',
      ],
      bullets: [
        '一度に .docx ファイル1個ずつ変換',
        '旧式 .doc 形式は非対応 — 先に .docx へ保存し直してください',
        '結果は常に download.md として保存されます',
        '元の文書は修正されません',
      ],
    },
    {
      heading: '変換後に残るもの — そして簡略化されるもの',
      paragraphs: [
        '変換機はWordの構造をMarkdownの構造へ移します。見出しはレベル（#, ##, ###）を保ち、箇条書きと番号付きリストはそのままリストになり、表はGitHubスタイルのMarkdown表に変わり、太字、斜体、リンクはそのまま引き継がれます。',
        'Markdownに対応要素のないWordの機能は、消えるのではなく簡略化されます。テキストボックス、段組みレイアウト、浮動画像は通常の読み順にフラット化され、テキストはいつも自然な順で届きます。意図的な制限が一つあります。文書に埋め込まれた画像は抽出されません。.md ファイルはテキストだけを含みます。',
      ],
    },
    {
      heading: 'なぜMarkdownか — そしてなぜローカルで処理するか',
      paragraphs: [
        'Markdownは現代的な執筆ツールの共通語です。Obsidianの保管庫、Notionへのインポート、Wiki、GitHub README、静的サイト生成器など、どこでも使われます。AIアシスタントが最もよく読み取る形式でもあり、ChatGPTやClaudeにMarkdownを貼り付けると、書式のないテキストの塊ではなく、文書の構造がそのまま伝わります。',
        'そしてそうしたファイルほど、他人のサーバーに上げたくありません。社内レポート、契約書の草案、会議メモ、出版前の原稿といった文書です。DofuPDFは、ファイルが既にある場所で変換します。ブラウザが .docx を読み、.md をディスクに書き、その間に送信されるものは何もありません。タブを閉じれば痕跡も残りません。',
      ],
    },
    {
      heading: 'ほかのツールと合わせて使う',
      paragraphs: [
        'スプレッドシートも同じ方式で処理したければ、[XLSXをMarkdownへ](/xlsx-to-markdown/) がすべてのシートをMarkdown表に変えます。出所がWordではなくPDFなら、[PDFをMarkdownへ](/pdf-to-markdown/) がテキストレイヤーを同じように抽出し構造化します。',
        '元ファイルがGoogle Docsなら、先に書き出してください（ファイル → ダウンロード → Microsoft Word .docx）、それからダウンロードしたファイルをここで変換すれば大丈夫です。',
      ],
    },
  ],
  alternatives: [
    {
      heading: 'Word または LibreOffice でプレーンテキストへ保存',
      paragraphs: [
        'どのワープロも文書を .txt ファイルに保存できます。無料でオフラインでも動きますが、結果物に構造がありません。見出し、リスト、表がすべて平らなテキストになり、手作業で作り直す必要があります。短い段落なら問題ないものの、文書全体にはDofuPDFの構造保持が確実に時間を節約してくれます。',
      ],
    },
    {
      heading: 'コマンドラインでPandocを使う',
      paragraphs: [
        'Pandocは .docx をMarkdownへネイティブに変換します（`pandoc report.docx -o report.md`）。バッチ変換をスクリプトで回すときに適したツールです。ただしインストールが必要で、コマンドラインを使えなければならず、複雑な表ではときどき見栄えのしない結果が出ることがあります。ブラウザで一度だけ変換するなら、DofuPDFはファイル1つで足ります。',
      ],
    },
    {
      heading: 'オンライン変換機とAIアシスタント',
      paragraphs: [
        'クラウド変換機やチャットベースのアシスタントも、上げた .docx をMarkdownに変えてくれますが、整理が大きく必要なことがあります。コストはアップロードそのものと、無料プランの容量制限、そしてアカウントや1日の割り当てです。公開文書ならそうした選択もいいですが、機密文書なら、ファイルを一度も送信しないローカルのツールがより安全な既定値です。',
      ],
    },
  ],
  edgeCases: [
    {
      heading: 'ファイルが .docx ではなく .doc の場合',
      paragraphs: [
        'このツールは新しい .docx 形式のみ読みます。古い .doc ファイルはWordまたはLibreOfficeで開き、「名前を付けて保存 → .docx」を選んでから、新しいファイルを変換してください。',
      ],
    },
    {
      heading: '変更履歴の追跡とコメント',
      paragraphs: [
        '変換機はファイルに保存された文書テキストをそのまま読みます。レビュー痕跡の多い文書なら、変換前にWordで変更履歴の採用または破棄を行い、コメントを解消しておいてください。',
      ],
    },
    {
      heading: '複雑なレイアウトはシンプルに整理されます',
      paragraphs: [
        'テキストボックス、段、浮動画像で飾った雑誌スタイルのページは、通常の読み順にフラット化されます。文言はすべて生き残ります。順序が重要なら、結果物をさっと見て、ときどき段落を移動してください。',
      ],
    },
  ],
  faqs: [
    {
      q: 'DofuPDFでのWordからMarkdownへ変換は無料ですか？',
      a: 'はい。すべてのDofuPDFツールは、ウォーターマーク、1日の回数制限、有料プランなしで永久に無料です。変換はお使いの端末の中で行われるため、サーバーコストは発生せず、その負担をご利用の方にかけることもありません。',
    },
    {
      q: 'どんな書式が保持されますか？',
      a: '見出し、箇条書きと番号付きリスト、表、太字、斜体、リンクがMarkdownの対応形式に変換されます。複雑なレイアウト（テキストボックス、段、浮動画像）は読み順に簡略化され、埋め込み画像は抽出されません。',
    },
    {
      q: '.doc ファイルも動きますか？',
      a: 'いいえ。新しい .docx 形式のみ対応しています。古い .doc ファイルはWordまたはLibreOfficeで開いて、先に .docx へ保存してください。',
    },
    {
      q: '変換したMarkdownはどこに使えますか？',
      a: 'Obsidian、Notion、Wiki、GitHub README、静的サイト生成器はもちろん、ChatGPTやClaudeなどAIツールへのきれいな入力としても最適です。MarkdownはAIが最もよく読み取る形式です。',
    },
    {
      q: '機密文書をここで変換しても安全ですか？',
      a: 'はい。ファイルはブラウザ内で読まれ変換され、どこにもアップロードされません。ページを読み込んだあとインターネット接続を切っても動作し、タブを閉じればすべての痕跡が消えます。',
    },
  ],
  related: ['how-to-convert-xlsx-to-markdown', 'how-to-convert-pdf-to-markdown', 'how-to-merge-pdf'],
};
