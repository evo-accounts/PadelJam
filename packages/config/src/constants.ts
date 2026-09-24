export const LOCALES = ['pt-PT', 'pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'pt-PT';

export const COUNTRIES = ['PT', 'BR'] as const;
export type Country = (typeof COUNTRIES)[number];

export const CURRENCIES = { PT: 'EUR', BR: 'BRL' } as const;

/**
 * Contact support field limits (Requirements/profile.md §6.4). The database enforces the same two
 * numbers as check constraints in 0106_support_ticket_length_limits.sql — change one, change both.
 * The clients apply them as `maxLength`, which counts UTF-16 units: an emoji is two there and one in
 * Postgres's `char_length`, so the client can only ever stop SHORT of the database's limit, never
 * let through something it would refuse.
 */
export const SUPPORT_TITLE_MAX = 80;
export const SUPPORT_DESCRIPTION_MAX = 2000;
