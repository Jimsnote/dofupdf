import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { compares } from '@/lib/compare';

/**
 * /compare/ index: every comparison page in the registry, as cards.
 */
export function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        DofuPDF比較
      </h1>
      <p className="mt-3 leading-relaxed text-slate-600">
        DofuPDFと人気PDFツールの正直な比較。ファクトチェック済みで、相手の本当に優れた点まで含めます。
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {compares.map((compare) => (
          <Link
            key={compare.slug}
            href={`/compare/${compare.slug}/`}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <h2 className="font-bold text-slate-900 group-hover:text-brand-700">
              DofuPDF vs {compare.competitor}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{compare.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
              比較を見る <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
