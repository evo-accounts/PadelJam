import { describe, it, expect } from 'vitest';
import { MOBILE_NAMESPACES } from './i18n-mobile';

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
