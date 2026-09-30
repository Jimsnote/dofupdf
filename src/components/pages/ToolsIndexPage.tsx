import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { localizedPath } from '@/lib/seo';
import { toolGroups } from '@/lib/tools';

interface ToolsIndexPageProps {
  locale: Locale;
  dict: Dictionary;
}

/**
 * Tools directory (/tools/): every live tool grouped by its category, each
 * card linking straight to the tool page. The groups and their order come from
 * the central registry (lib/tools.ts), so adding a tool is all it takes to
 * surface it here.
 */
export function ToolsIndexPage({ locale, dict }: ToolsIndexPageProps) {
  const copy = dict.toolsIndex;
  const groups = toolGroups();
  const totalCount = groups.reduce((sum, group) => sum + group.tools.length, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        {copy.heading}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
        {copy.subheading.replace('{count}', String(totalCount))}
      </p>

      <div className="mt-12 space-y-14">
        {groups.map((group) => (
          <section key={group.category} aria-labelledby={`category-${group.category}`}>
            <h2
              id={`category-${group.category}`}
              className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
            >
              {copy.categories[group.category]}
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {group.tools.map((tool) => {
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
        ))}
      </div>
    </div>
  );
}
