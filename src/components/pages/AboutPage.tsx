import type { Dictionary } from '@/i18n/locales/ja';
import { GITHUB_URL } from '@/lib/site';

interface AboutPageProps {
  dict: Dictionary;
}

export function AboutPage({ dict }: AboutPageProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
        {dict.about.heading}
      </h1>

      <div className="mt-10 space-y-12">
        {dict.about.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.title}</h2>
            <div className="mt-4 space-y-4">
              {section.paragraphs.map((p, i) => (
                <p key={i} className="leading-relaxed text-slate-700">
                  {p}
                </p>
              ))}
            </div>
            {'list' in section && section.list ? (
              <ul className="mt-4 list-disc space-y-2 pl-6 text-slate-700">
                {section.list.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
            {section.title === dict.about.sections[4].title ? (
              <p className="mt-4">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  GitHub
                </a>
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
