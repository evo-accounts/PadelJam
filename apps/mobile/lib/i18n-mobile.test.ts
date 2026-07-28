import { describe, it, expect } from 'vitest';
import { createInstance } from 'i18next';
import { MOBILE_NAMESPACES, registerMobileCopy } from './i18n-mobile';

const tokens = (s: string): string[] =>
  ((s.match(/\{\{\s*(\w+)\s*\}\}/g) ?? []).map((t) => t.replace(/\s/g, ''))).sort();

type LocaleBlock = Record<string, string>;

describe('mobile i18n locale parity', () => {
  for (const [ns, blocks] of Object.entries(MOBILE_NAMESPACES)) {
    const en = (blocks as Record<string, LocaleBlock>).en as LocaleBlock;
    for (const locale of ['pt-PT', 'pt-BR'] as const) {
      const loc = (blocks as Record<string, LocaleBlock>)[locale] as LocaleBlock | undefined;
      it(`${ns}/${locale} has the same keys as en`, () => {
        expect(loc).toBeDefined();
        expect(Object.keys(loc ?? {}).sort()).toEqual(Object.keys(en).sort());
      });
      it(`${ns}/${locale} preserves placeholders`, () => {
        for (const k of Object.keys(en)) {
          expect(tokens((loc ?? {})[k] ?? '')).toEqual(tokens(en[k] ?? ''));
        }
      });
    }
  }
});

describe('welcome screen copy resolves from the auth namespace', () => {
  const welcomeKeys = [
    'welcomeTitle1',
    'welcomeBody1',
    'welcomeTitle2',
    'welcomeBody2',
    'welcomeTitle3',
    'welcomeBody3',
    'startNow',
  ];
  for (const locale of ['pt-PT', 'pt-BR', 'en'] as const) {
    it(`resolves every welcome key for ${locale}`, async () => {
      const instance = createInstance();
      await instance.init({ lng: locale, fallbackLng: 'en', resources: {} });
      registerMobileCopy(instance);
      const t = instance.getFixedT(locale, 'auth');
      for (const key of welcomeKeys) {
        const value = t(key);
        expect(value, `auth:${key} (${locale})`).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    });
  }
});
