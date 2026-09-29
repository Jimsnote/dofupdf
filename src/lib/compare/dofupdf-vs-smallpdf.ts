import type { Compare } from './types';

export const dofuPdfVsSmallpdf: Compare = {
  slug: 'dofupdf-vs-smallpdf',
  competitor: 'Smallpdf',
  title: 'DofuPDF vs Smallpdf: 無料利用回数の比較 | DofuPDF',
  description:
    'Smallpdfは無料利用を1日2回に制限し、ファイルをサーバーにアップロードします。DofuPDFは1日制限がなく、すべてをブラウザ内でローカルに処理します。無料で、登録も不要です。',
  verdict:
    'Smallpdfは洗練された人気のPDFツールですが、無料プランは1日2回までしか使えず、文書をサーバーにアップロードする必要があります。Proは月約12ドルから。DofuPDFには1日の作業制限がまったくなく、アカウントも要求しません。すべてのツールがブラウザ内でローカルに動作するからです。頻繁に、毎日おこなうPDF作業なら、DofuPDFのほうが制約が少なく、プライバシーにも配慮した選択です。',
  rows: [
    {
      feature: 'ファイルの処理場所',
      dofuPdf: '自分のデバイス内で処理（ブラウザ内WebAssembly）',
      them: 'Smallpdfサーバーへアップロード',
    },
    {
      feature: '1日の作業回数制限',
      dofuPdf: 'なし',
      them: '無料プランは1日2回',
    },
    {
      feature: '料金',
      dofuPdf: '無料、目に付かない広告で運営',
      them: '無料プラン + Proは月約12ドルから',
    },
    {
      feature: 'アカウントの有無',
      dofuPdf: '不要',
      them: '1日の無料利用枠の管理に必要',
    },
    {
      feature: 'オフライン動作',
      dofuPdf: '可能 — ページ読み込み後も動作継続',
      them: '不可 — アップロードに接続が必要',
    },
    {
      feature: 'プライバシーへの考え方',
      dofuPdf: 'ファイルはデバイスから外出しません。オープンソース（AGPL-3.0）',
      them: '短い保存期間後に削除（ポリシー基準）',
    },
    {
      feature: '目立つ追加機能',
      dofuPdf: 'ページを視覚的に整理、OfficeをMarkdownへ、オープンソースのコード',
      them: '電子署名、AI文書要約、デスクトップおよびモバイルアプリ',
    },
  ],
  factChecked: '2026年7月21日にファクトチェック',
  sources: [
    { label: 'Smallpdf Pro価格', url: 'https://smallpdf.com/pro' },
    { label: 'Smallpdf公式サイト', url: 'https://smallpdf.com/' },
  ],
  theirStrengths: [
    'ガイド付き署名フローを備えた電子署名は、DofuPDFにはない機能です。',
    '文書要約、PDFと対話できるAI機能。',
    'オフラインと外出先での利用向けのネイティブなデスクトップ・モバイルアプリ。',
  ],
  faqs: [
    {
      q: '1日2回の制限は本当ですか？',
      a: 'はい。Smallpdfの価格ページには、無料プランが1日2文書に制限されると明記されています。上限に達すると、翌日まで待つかProへアップグレードする必要があります。DofuPDFにそうした制限はありません。作業は借り物のサーバーではなく自分のデバイスでおこなわれるため、何度でも使えます。',
    },
    {
      q: '機密性の高いファイルにはどちらが適していますか？',
      a: 'SmallpdfはファイルをTLSで送信し、短い保存期間後に削除すると表明しています。多くの文書では妥当な水準ですが、契約書、医療記録、財務諸表については、どこへも送らないことが最も安全な方法であり、DofuPDFはまさにそう動作します。',
    },
    {
      q: 'Smallpdfを有料で使う価値があるのはどんな場合ですか？',
      a: '電子署名、AI要約、ネイティブアプリでのオフラインワークフローを定期的に必要とするなら、Smallpdf Proは妥当な価格です。作業のほとんどがPDFの結合、分割、圧縮、変換、保護なら、DofuPDFが無料で、制限なくカバーします。',
    },
  ],
};
