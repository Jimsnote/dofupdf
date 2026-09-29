import { ChevronDown } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { FactSummary } from '@/components/seo/FactSummary';
import { JsonLd } from '@/components/seo/JsonLd';

interface FaqPageProps {
  dict: Dictionary;
}

export function FaqPage({ dict }: FaqPageProps) {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: dict.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <JsonLd data={faqLd} />

      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{dict.faq.heading}</h1>

      <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200">
        {dict.faq.items.map((item) => (
          <details key={item.question} className="group px-6 py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown
                className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="mt-3 leading-relaxed text-slate-700">{item.answer}</p>
          </details>
        ))}
      </div>

      <div className="mt-12">
        <FactSummary text={dict.factSummary} />
      </div>
    </article>
  );
}
