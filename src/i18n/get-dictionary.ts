import type { Locale } from './config';
import { ja, type Dictionary } from './locales/ja';

const dictionaries: Record<Locale, Dictionary> = { ja };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
