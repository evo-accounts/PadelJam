import { describe, expect, it } from 'vitest';

import { ONBOARDING_QUESTION_STEPS } from '../../lib/postVerifyRoute';
import { questionProgress } from './progress';

describe('questionProgress', () => {
  it('counts location, hand and side as 1/3, 2/3 and 3/3 until Level ships', () => {
    expect(ONBOARDING_QUESTION_STEPS).toEqual(['location', 'hand', 'side']);
    expect(questionProgress('location')).toEqual({ n: 1, total: 3 });
    expect(questionProgress('hand')).toEqual({ n: 2, total: 3 });
    expect(questionProgress('side')).toEqual({ n: 3, total: 3 });
  });

  it('follows the list: a fourth step makes every bar n/4', () => {
    const withLevel = ['location', 'level', 'hand', 'side'] as never;
    expect(questionProgress('side', withLevel)).toEqual({ n: 4, total: 4 });
    expect(questionProgress('hand', withLevel)).toEqual({ n: 3, total: 4 });
  });
});
