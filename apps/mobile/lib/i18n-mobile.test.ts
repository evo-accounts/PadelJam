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
    'getStarted',
    'signIn',
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

describe('welcome screen call to action copy', () => {
  const authOf = async (locale: 'pt-PT' | 'pt-BR' | 'en') => {
    const instance = createInstance();
    await instance.init({ lng: locale, fallbackLng: 'en', resources: {} });
    registerMobileCopy(instance);
    return instance.getFixedT(locale, 'auth');
  };

  it('retired the single "Start now" key: Welcome has two CTAs now', () => {
    for (const [locale, blocks] of Object.entries(MOBILE_NAMESPACES.auth)) {
      expect(Object.keys(blocks), `auth/${locale}`).not.toContain('startNow');
    }
  });

  // The E2E driver finds the welcome screen by these exact English labels
  // (e2e/driver/flows.ts passWelcomeIfPresent, e2e/driver/app.ts freshInstall,
  // e2e/suites/01-auth). A copy change here has to change them there, and this
  // fails in a second where the suite would fail forty minutes into a run.
  it('English welcome labels are the ones the E2E driver looks for', async () => {
    const t = await authOf('en');
    expect(t('welcomeTitle1')).toBe('Find games near you');
    expect(t('getStarted')).toBe('Get started');
    expect(t('signIn')).toBe('Sign in');
  });

  // The design sets the single … glyph (U+2026), not three full stops; keep it that
  // way in every locale so the line does not read differently per language.
  for (const locale of ['pt-PT', 'pt-BR', 'en'] as const) {
    it(`welcomeBody2 uses the real ellipsis character in ${locale}`, async () => {
      const body = (await authOf(locale))('welcomeBody2');
      expect(body).toContain('\u2026');
      expect(body).not.toContain('...');
    });
  }
});
