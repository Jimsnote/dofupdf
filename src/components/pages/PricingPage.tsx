import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { JsonLd } from '@/components/seo/JsonLd';
import { LicenseCard } from './LicenseCard';

interface PricingPageProps {
  dict: Dictionary;
}

/** Hosted checkout URL comes from build-time env; placeholder until configured. */
const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL ??
  'https://dofupdf.lemonsqueezy.com/checkout/buy/PLACEHOLDER';

/**
 * /pricing/ — DofuPDF Pro（買い切り ¥4,980）。Copy is verbatim from the W2/W3
 * brief (dict.pricing). JSON-LD: SoftwareApplication with a 4980 JPY offer —
 * never aggregateRating/review (no real data).
 */
export function PricingPage({ dict }: PricingPageProps) {
  const copy = dict.pricing;

  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${SITE_NAME} Pro`,
    url: `${SITE_URL}/pricing/`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any (Web browser)',
    offers: {
      '@type': 'Offer',
      price: '4980',
      priceCurrency: 'JPY',
    },
    description: copy.metaDescription,
  };

  return (
    <article className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <JsonLd data={softwareLd} />
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', path: '/' },
          { name: copy.heading, path: '/pricing/' },
        ]}
      />

      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        {copy.heading}
      </h1>
      <p className="mt-4 text-xl font-semibold leading-relaxed text-slate-700">{copy.lead}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{copy.freeHeading}</h2>
          <ul className="mt-4 space-y-2.5">
            {copy.freeItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border-2 border-brand-300 bg-brand-50 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{copy.proHeading}</h2>
          <ul className="mt-4 space-y-2.5">
            {copy.proItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-800">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <a
            href={CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            {copy.buyLabel}
          </a>
        </section>
      </div>

      <div className="mt-10">
        <LicenseCard dict={dict} />
      </div>

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

      <p className="mt-10 text-sm text-slate-500">
        <Link href="/tokushoho/" className="underline-offset-2 hover:underline">
          {dict.footer.tokushoho}
        </Link>
      </p>
    </article>
  );
}
