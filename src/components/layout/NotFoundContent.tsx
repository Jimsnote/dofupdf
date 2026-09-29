import Link from 'next/link';

/** Shared 404 content for the not-found page and the app-wide 404 document. */
export function NotFoundContent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">ページが見つかりません</h1>
      <p className="mt-2 text-slate-600">
        お求めのページは存在しません。
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        DofuPDFホームに戻る
      </Link>
    </div>
  );
}
