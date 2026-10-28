import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { guides } from '@/lib/guides';
import { localizedPath } from '@/lib/seo';
import { liveTools } from '@/lib/tools';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';

interface ToolsIndexPageProps {
  locale: Locale;
  dict: Dictionary;
}

/**
 * Tools directory (/tools/): after the W1 consolidation this is a curated
 * page — the two password tools, plus entry points to the /pdf-password/ hub
 * and the two password guides.
 */
export function ToolsIndexPage({ locale, dict }: ToolsIndexPageProps) {
  const copy = dict.toolsIndex;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', path: '/' },
          { name: copy.heading, path: '/tools/' },
        ]}
      />
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        {copy.heading}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">{copy.subheading}</p>

      <section aria-labelledby="tools-index-tools" className="mt-12">
        <h2 id="tools-index-tools" className="text-xl font-bold tracking-tight text-slate-900">
          {copy.toolsHeading}
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {liveTools.map((tool) => {
            const Icon = tool.icon;
            const toolCopy = dict.tools[tool.i18nKey];
            return (
              <Link
                key={tool.slug}
                href={localizedPath(locale, `/${tool.slug}`)}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{toolCopy.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {toolCopy.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="tools-index-guides" className="mt-14">
        <h2 id="tools-index-guides" className="text-xl font-bold tracking-tight text-slate-900">
          {copy.guidesHeading}
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/pdf-password/"
            className="rounded-xl border border-brand-300 bg-white p-5 shadow-sm ring-1 ring-brand-200 transition-shadow hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-slate-900">PDFパスワードのすべて</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              設定・変更・解除、権限、安全な送り方まで一括解説。
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              詳しく見る
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}/`}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-slate-900">{guide.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{guide.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
