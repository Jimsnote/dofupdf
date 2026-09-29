import Link from 'next/link';
import { Github } from 'lucide-react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { localizedPath } from '@/lib/seo';
import { GITHUB_URL } from '@/lib/site';

interface FooterProps {
  locale: Locale;
  dict: Dictionary;
}

export function Footer({ locale, dict }: FooterProps) {
  const year = new Date().getFullYear();
  const pageLinks = [
    { label: dict.footer.about, href: localizedPath(locale, '/about') },
    { label: dict.footer.privacy, href: localizedPath(locale, '/privacy') },
    { label: dict.footer.terms, href: localizedPath(locale, '/terms') },
    { label: dict.footer.faq, href: localizedPath(locale, '/faq') },
  ];

  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-sm font-medium text-brand-700">{dict.footer.pillars}</p>

        <nav
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          aria-label="Footer"
        >
          <span className="sr-only">{dict.footer.pagesHeading}</span>
          {pageLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-slate-600 hover:text-brand-700"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-700"
          >
            <Github className="h-4 w-4" aria-hidden />
            {dict.footer.github}
          </a>
        </nav>

        <p className="mt-8 text-center text-xs text-slate-500">
          {dict.footer.copyright.replace('{year}', String(year))}
        </p>
      </div>
    </footer>
  );
}
