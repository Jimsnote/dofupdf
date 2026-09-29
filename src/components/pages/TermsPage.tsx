import type { Dictionary } from '@/i18n/locales/ja';

interface TermsPageProps {
  dict: Dictionary;
}

export function TermsPage({ dict }: TermsPageProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
        {dict.terms.heading}
      </h1>
      <p className="mt-3 text-sm text-slate-500">{dict.terms.lastUpdated}</p>

      <div className="mt-12 space-y-10">
        {dict.terms.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{section.title}</h2>
            <div className="mt-3 space-y-4">
              {section.paragraphs.map((p, i) => (
                <p key={i} className="leading-relaxed text-slate-700">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
