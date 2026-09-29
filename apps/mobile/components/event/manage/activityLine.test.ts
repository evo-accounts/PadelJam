import { describe, expect, it } from 'vitest';

import { MOBILE_NAMESPACES } from '../../../lib/i18n-mobile';
import { ACTIVITY_ACTIONS, activityWhat, EDIT_GROUPS, relativeWhen, type ActivityInput } from './activityLine';

const money = (n: number) => `€${n}`;
const LOCALES = ['pt-PT', 'pt-BR', 'en'] as const;
const catalog = MOBILE_NAMESPACES.event as unknown as Record<(typeof LOCALES)[number], Record<string, string>>;

/** i18next plural keys: `x` resolves through `x_one` / `x_other` when a count is passed. */
const hasKey = (locale: (typeof LOCALES)[number], key: string) =>
  key in catalog[locale] || (`${key}_one` in catalog[locale] && `${key}_other` in catalog[locale]);

/** Every detail shape the server writes for an action, so every key branch is reached. */
const VARIANTS: ActivityInput[] = [
  ...ACTIVITY_ACTIONS.map((action) => ({ action, detail: { target_name: 'Ana' } })),
  { action: 'left', detail: { status: 'waiting_list' } },
  { action: 'removed', detail: { mode: 'to_invited', target_name: 'Ana' } },
  { action: 'removed', detail: { mode: 'from_event', target_name: 'Ana' } },
  { action: 'removed', detail: { mode: 'invitation', target_name: 'Ana' } },
  { action: 'marked_all_paid', detail: { count: 3 } },
  { action: 'fee_changed', detail: { from: 5, to: 7.5 } },
  { action: 'event_edited', detail: { changes: [...EDIT_GROUPS] } },
  { action: 'ranking_changed', detail: { enabled: true } },
  { action: 'ranking_changed', detail: { enabled: false } },
  { action: 'score_entered', detail: { round_number: 2, court_number: 1 } },
  { action: 'score_edited', detail: { round_number: 2, court_number: 1 } },
  { action: 'match_not_played', detail: { round_number: 2, court_number: 1 } },
  { action: 'some_future_action', detail: null },
];

describe('activityWhat', () => {
  it('resolves every action and detail shape to a key present in pt-PT, pt-BR and en', () => {
    for (const row of VARIANTS) {
      const what = activityWhat(row, money);
      for (const locale of LOCALES) {
        expect(hasKey(locale, what.key), `${locale} ${what.key}`).toBe(true);
        for (const g of what.groups ?? []) expect(hasKey(locale, g), `${locale} ${g}`).toBe(true);
      }
    }
  });

  it('the relative-time keys exist in every locale', () => {
    for (const locale of LOCALES) {
      for (const key of ['actAgoNow', 'actAgoMinutes', 'actAgoHours', 'actAgoDays', 'actSystemActor']) {
        expect(hasKey(locale, key), `${locale} ${key}`).toBe(true);
      }
    }
  });

  it('never folds an unknown action into a known one', () => {
    expect(activityWhat({ action: 'some_future_action', detail: null }, money).key).toBe('actWhat_other');
  });

  it('removal says where the player went (0122 modes, 0127 invitation)', () => {
    expect(activityWhat({ action: 'removed', detail: { mode: 'to_invited' } }, money).key).toBe('actWhat_removed_to_invited');
    expect(activityWhat({ action: 'removed', detail: { mode: 'from_event' } }, money).key).toBe('actWhat_removed');
    expect(activityWhat({ action: 'removed', detail: { mode: 'invitation' } }, money).key).toBe('actWhat_removed_invitation');
  });

  it('a fee change carries both amounts; the guest name stands in for a target', () => {
    expect(activityWhat({ action: 'fee_changed', detail: { from: 5, to: '7.5' } }, money)).toEqual({
      key: 'actWhat_fee_changed_amounts',
      params: { from: '€5', to: '€7.5' },
    });
    expect(activityWhat({ action: 'guest_added', detail: { guest_name: 'Gil' } }, money).params.target).toBe('Gil');
  });

  it('an edit lists only the change groups it knows', () => {
    const what = activityWhat({ action: 'event_edited', detail: { changes: ['date', 'bogus', 'scoring'] } }, money);
    expect(what.groups).toEqual(['actEditGroup_date', 'actEditGroup_scoring']);
    expect(activityWhat({ action: 'event_edited', detail: { changes: [] } }, money).key).toBe('actWhat_event_edited');
  });
});

describe('relativeWhen', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it('steps from now to minutes, hours, days, then a date', () => {
    expect(relativeWhen(ago(20_000), now)).toEqual({ key: 'actAgoNow' });
    expect(relativeWhen(ago(5 * 60_000), now)).toEqual({ key: 'actAgoMinutes', count: 5 });
    expect(relativeWhen(ago(3 * 3_600_000), now)).toEqual({ key: 'actAgoHours', count: 3 });
    expect(relativeWhen(ago(2 * 86_400_000), now)).toEqual({ key: 'actAgoDays', count: 2 });
    expect(relativeWhen(ago(9 * 86_400_000), now).key).toBe('actAgoDate');
  });
});
