import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { getGuideForTool } from '@/lib/guides';
import { localizedUrl } from '@/lib/seo';
import { splitLeadSentence } from '@/lib/text';
import { SITE_NAME } from '@/lib/site';
import { FactSummary } from '@/components/seo/FactSummary';
import { JsonLd } from '@/components/seo/JsonLd';

export type ToolSlug =
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'jpg-to-pdf'
  | 'heic-to-pdf'
  | 'organize-pdf'
  | 'remove-pages'
  | 'extract-pages'
  | 'reorder-pages'
  | 'docx-to-markdown'
  | 'xlsx-to-markdown'
  | 'extract-images'
  | 'pdf-to-jpg'
  | 'compress-pdf'
  | 'protect-pdf'
  | 'unlock-pdf'
  | 'watermark-pdf'
  | 'page-numbers'
  | 'pdf-to-markdown'
  | 'sign-pdf'
  | 'qr-code'
  | 'ocr-pdf'
  | 'receipt-sheet'
  | 'hanko-pdf'
  | 'invoice-rename';

interface ToolPageScaffoldProps {
  locale: Locale;
  dict: Dictionary;
  slug: ToolSlug;
  /** The interactive client tool component. */
  children: ReactNode;
}

/**
 * Shared layout for tool pages: the interactive tool, followed by how-to
 * steps, a privacy explainer, FAQs, and the canonical fact summary. Emits
 * WebApplication and HowTo JSON-LD built from the localized copy.
 */
export function ToolPageScaffold({ locale, dict, slug, children }: ToolPageScaffoldProps) {
  const copy = dict.toolPages[slug];
  // Korean-only long-form tutorial attached to this tool, if one exists.
  const guide = getGuideForTool(slug);
  // Tool-specific FAQs plus the site-wide shared ones (e.g. usage limits).
  const faqItems = [...copy.faq, ...dict.sharedToolFaq];

  const webApplicationLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: dict.tools[slug].name,
    url: localizedUrl(locale, `/${slug}`),
    description: copy.metaDescription,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
    },
    creator: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
  };

  const howToLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: copy.stepsHeading,
    step: copy.steps.map((text, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text,
    })),
  };

  // Built from the same dictionary entries as the visible FAQ below, so the
  // structured data always matches the on-page content.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
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
      <JsonLd data={webApplicationLd} />
      <JsonLd data={howToLd} />
      <JsonLd data={faqLd} />

      {children}

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{copy.stepsHeading}</h2>
        <ol className="mt-6 list-decimal space-y-3 pl-6 text-slate-700">
          {copy.steps.map((step, index) => (
            <li key={index} className="leading-relaxed">
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {copy.privacyHeading}
        </h2>
        <p className="mt-4 leading-relaxed text-slate-700">{copy.privacyText}</p>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{copy.faqHeading}</h2>
        <div className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200">
          {faqItems.map((item) => {
            const [lead, rest] = splitLeadSentence(item.answer);
            return (
              <details key={item.question} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="mt-3 leading-relaxed text-slate-700">
                  <strong className="font-semibold text-slate-900">{lead}</strong>
                  {rest ? ` ${rest}` : ''}
                </p>
              </details>
            );
          })}
        </div>
      </section>

      {guide ? (
        <section className="mt-12">
          <Link
            href={`/guides/${guide.slug}/`}
            className="flex items-center justify-between gap-4 rounded-xl border border-brand-100 bg-brand-50 p-6 transition-colors hover:border-brand-300"
          >
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                {dict.guideCta}
              </p>
              <p className="mt-1 font-semibold text-slate-900">{guide.title}</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          </Link>
        </section>
      ) : null}

      <div className="mt-12">
        <FactSummary text={dict.factSummary} />
      </div>
    </article>
  );
}
