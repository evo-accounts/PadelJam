export const LOCALES = ['pt-PT', 'pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'pt-PT';

export const COUNTRIES = ['PT', 'BR'] as const;
export type Country = (typeof COUNTRIES)[number];

export const CURRENCIES = { PT: 'EUR', BR: 'BRL' } as const;
