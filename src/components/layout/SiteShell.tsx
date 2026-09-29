import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { Header } from './Header';
import { Footer } from './Footer';

interface SiteShellProps {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}

/** Shared chrome for every page: header, main, footer. */
export function SiteShell({ locale, dict, children }: SiteShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header locale={locale} dict={dict} />
      <main className="flex-1">{children}</main>
      <Footer locale={locale} dict={dict} />
    </div>
  );
}
