import type { Metadata } from 'next';
import { defaultLocale, locales, ogLocales, type Locale } from '@/i18n/config';
import { SITE_NAME, SITE_URL } from './site';

/**
 * Maps a locale + logical path (e.g. '/about', '' for home) to the site path
 * actually served. The default locale lives at the root, all others under
 * their prefix. Paths carry a trailing slash to match `trailingSlash: true`.
 */
export function localizedPath(locale: Locale, path: string): string {
  const base = path === '' ? '/' : `${path}/`;
  return locale === defaultLocale ? base : `/${locale}${base}`;
}

export function localizedUrl(locale: Locale, path: string): string {
  return `${SITE_URL}${localizedPath(locale, path)}`;
}

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * Builds canonical + hreflang alternates for a logical path shared by all
 * locales (e.g. '/about'). `x-default` always points at the English version.
 */
export function buildAlternates(path: string, locale: Locale = defaultLocale): Alternates {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = localizedUrl(l, path);
  }
  languages['x-default'] = localizedUrl(defaultLocale, path);
  return {
    canonical: localizedUrl(locale, path),
    languages,
  };
}

/** Static Open Graph share image (1200x630), generated in public/og.png. */
export const OG_IMAGE_URL = `${SITE_URL}/og.png`;

/**
 * Full per-page metadata: localized title/description, canonical + hreflang
 * alternates, Open Graph (with the correct og:locale) and Twitter card.
 */
export function pageMetadata(
  locale: Locale,
  path: string,
  title: string,
  description: string,
): Metadata {
  const alternates = buildAlternates(path, locale);
  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      siteName: SITE_NAME,
      locale: ogLocales[locale],
      type: 'website',
      images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE_URL],
    },
  };
}
