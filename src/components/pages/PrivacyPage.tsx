import type { Dictionary } from '@/i18n/locales/ja';

interface PrivacyPageProps {
  dict: Dictionary;
}

export function PrivacyPage({ dict }: PrivacyPageProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
        {dict.privacy.heading}
      </h1>
      <p className="mt-3 text-sm text-slate-500">{dict.privacy.lastUpdated}</p>

      <aside className="mt-8 rounded-xl border border-brand-200 bg-brand-50 p-6">
        <h2 className="text-lg font-bold text-brand-900">{dict.privacy.tldr.title}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm leading-relaxed text-slate-700">
          {dict.privacy.tldr.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </aside>

      <div className="mt-12 space-y-10">
        {dict.privacy.sections.map((section) => (
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
