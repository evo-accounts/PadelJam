import type { EventDetail } from '@padel/api';
import { describe, expect, it } from 'vitest';

import { feeLabel, preferencesSummary, scoringLabel } from './eventLabels';

const t = (key: string, o?: Record<string, unknown>) => (o?.count != null ? `${key}:${o.count}` : key);
const prefs = {
  is_private: false,
  group_id: 'g',
  allow_standby: false,
  standby_spots: null,
  entrance_fee_enabled: false,
  entrance_fee_amount: null,
  entrance_fee_method: null,
  players_submit_results: false,
} as unknown as EventDetail;

describe('eventLabels', () => {
  it('scoring shows the value except for classic sets', () => {
    expect(scoringLabel(t, { scoring_mode: 'points', scoring_value: 32 })).toBe('scoringPointsLabel · 32');
    expect(scoringLabel(t, { scoring_mode: 'classic', scoring_value: null })).toBe('scoringClassicLabel');
  });

  it('fee reads free, or amount and method', () => {
    expect(feeLabel(t, prefs)).toBe('feeFree');
    expect(feeLabel(t, { ...prefs, entrance_fee_enabled: true, entrance_fee_amount: 5, entrance_fee_method: 'cash' })).toBe(
      '5 · feeCashLabel',
    );
  });

  it('summarises what is switched on', () => {
    expect(preferencesSummary(t, prefs)).toBe('prefSummaryNone');
    expect(
      preferencesSummary(t, { ...prefs, is_private: true, allow_standby: true, standby_spots: 2, players_submit_results: true }),
    ).toBe('prefSummaryPrivate · prefSummaryStandby:2 · prefSummaryResults');
    // Group-less events are always private: not worth a word.
    expect(preferencesSummary(t, { ...prefs, is_private: true, group_id: null })).toBe('prefSummaryNone');
  });
});
