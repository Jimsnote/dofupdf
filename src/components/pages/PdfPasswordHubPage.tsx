import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { guides } from '@/lib/guides';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { JsonLd } from '@/components/seo/JsonLd';

interface PdfPasswordHubPageProps {
  dict: Dictionary;
}

/**
 * /pdf-password/ — the password hub page (W1). Copy lives in
 * dict.pdfPasswordHub; section first sentences are written as self-contained
 * answers (AI-citable). Emits FAQPage + BreadcrumbList JSON-LD.
 */
export function PdfPasswordHubPage({ dict }: PdfPasswordHubPageProps) {
  const copy = dict.pdfPasswordHub;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: copy.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <JsonLd data={faqLd} />
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', path: '/' },
          { name: copy.heading, path: '/pdf-password/' },
        ]}
      />

      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        {copy.heading}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">{copy.intro}</p>

      {copy.sections.map((section) => (
        <section key={section.id} className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{section.heading}</h2>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className="mt-4 leading-relaxed text-slate-700">
              {paragraph}
            </p>
          ))}
          <div className="mt-4 flex flex-wrap gap-3">
            {section.link ? (
              <Link
                href={section.link.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50"
              >
                {section.link.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
            {'link2' in section && section.link2 ? (
              <Link
                href={section.link2.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50"
              >
                {section.link2.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        </section>
      ))}

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{copy.faqHeading}</h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {copy.faqs.map((faq) => (
            <details key={faq.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {faq.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 leading-relaxed text-slate-700">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{copy.relatedHeading}</h2>
        <ul className="mt-4 space-y-2">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={`/guides/${guide.slug}/`}
                className="font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                {guide.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
