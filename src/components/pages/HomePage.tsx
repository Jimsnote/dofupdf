import { ArrowDown, ArrowRight, CheckCircle2, Lock, Zap } from 'lucide-react';
import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { guides } from '@/lib/guides';
import { localizedPath, localizedUrl } from '@/lib/seo';
import { GITHUB_URL, SITE_NAME } from '@/lib/site';
import { liveTools, tools, toolNames } from '@/lib/tools';
import { JsonLd } from '@/components/seo/JsonLd';

interface HomePageProps {
  locale: Locale;
  dict: Dictionary;
}

const pillarIcons = [Lock, Zap, CheckCircle2];

export function HomePage({ locale, dict }: HomePageProps) {
  const webApplicationLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: localizedUrl(locale, ''),
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
    },
    featureList: toolNames(dict),
  };

  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: localizedUrl(locale, ''),
    logo: localizedUrl(locale, '').replace(/\/$/, '') + '/logo.svg',
    sameAs: [GITHUB_URL],
  };

  return (
    <>
      <JsonLd data={webApplicationLd} />
      <JsonLd data={organizationLd} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {dict.home.hero.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            {dict.home.hero.subtitle}
          </p>
          <a
            href="#tools"
            className="mt-10 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            {dict.home.hero.cta}
            <ArrowDown className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </section>

      {/* Three pillars */}
      <section aria-label={dict.home.pillars.heading} className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <h2 className="sr-only">{dict.home.pillars.heading}</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {dict.home.pillars.items.map((pillar, i) => {
            const Icon = pillarIcons[i];
            return (
              <div
                key={pillar.title}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{pillar.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tools grid */}
      <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          {dict.home.toolsSection.heading}
        </h2>
        <p className="mt-3 text-slate-600">
          {dict.home.toolsSection.subheading.replace('{count}', String(liveTools.length))}
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const copy = dict.tools[tool.i18nKey];
            const live = tool.status === 'live';
            const cardBody = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  {!live ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {dict.common.comingSoon}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{copy.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{copy.description}</p>
              </>
            );
            const cardClass = `relative rounded-xl border border-slate-200 bg-white p-5 ${
              live ? 'shadow-sm transition-shadow hover:shadow-md' : 'opacity-80'
            }`;
            return live ? (
              <Link
                key={tool.slug}
                href={localizedPath(locale, `/${tool.slug}`)}
                className={cardClass}
              >
                {cardBody}
              </Link>
            ) : (
              <div key={tool.slug} aria-disabled className={cardClass}>
                {cardBody}
              </div>
            );
          })}
        </div>
      </section>

      {/* Why local processing matters */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            {dict.home.why.heading}
          </h2>
          <div className="mt-6 space-y-5">
            {dict.home.why.paragraphs.map((p, i) => (
              <p key={i} className="leading-relaxed text-slate-700">
                {p}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Proof points */}
      <section aria-label={dict.home.proof.heading} className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          {dict.home.proof.heading}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {dict.home.proof.items.map((item) => (
            <div key={item.title} className="rounded-xl bg-slate-50 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Guides & Tutorials — Japanese-only site, so this module always renders */}
      {locale === 'ja' ? (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                PDFガイド・チュートリアル
              </h2>
              <p className="mt-2 text-slate-600">
                すべてのツールを使いこなすためのステップバイステップチュートリアル。
              </p>
            </div>
            <Link
              href="/guides/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              すべてのガイド
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {guides.slice(0, 4).map((guide) => (
              <Link
                key={guide.slug}
                href={`/guides/${guide.slug}/`}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <h3 className="text-base font-semibold text-slate-900">{guide.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {guide.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
