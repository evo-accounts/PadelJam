import { DEFAULT_LOCALE, LOCALES, type Locale } from '@padel/config';

/**
 * Resolves an arbitrary locale candidate (e.g. an `expo-localization`
 * languageTag/languageCode) to one of the supported {@link LOCALES}:
 *   1. exact match (case-insensitive) -> that locale
 *   2. language-prefix match (e.g. 'pt' or 'pt-XX' -> 'pt-PT')
 *   3. otherwise the {@link DEFAULT_LOCALE}
 */
export function resolveLocale(candidate: string | undefined): Locale {
  if (!candidate) return DEFAULT_LOCALE;
  const normalized = candidate.toLowerCase();

  const exact = LOCALES.find((l) => l.toLowerCase() === normalized);
  if (exact) return exact;

  const lang = normalized.split('-')[0];
  const byLang = LOCALES.find((l) => l.toLowerCase().split('-')[0] === lang);
  if (byLang) return byLang;

  return DEFAULT_LOCALE;
}
