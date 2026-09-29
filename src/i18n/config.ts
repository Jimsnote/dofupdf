export const locales = ['ja'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ja';

/** Locales that live under a path prefix (everything except the default). */
export const prefixedLocales = locales.filter((l) => l !== defaultLocale) as Exclude<
  Locale,
  typeof defaultLocale
>[];

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Human-readable native names, used by the language switcher. */
export const localeLabels: Record<Locale, string> = {
  ja: '日本語',
};

/** Open Graph locale values (og:locale). */
export const ogLocales: Record<Locale, string> = {
  ja: 'ja_JP',
};
