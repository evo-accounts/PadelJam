import { describe, expect, it } from 'vitest';

import { ONBOARDING_QUESTION_STEPS } from '../../lib/postVerifyRoute';
import { questionProgress } from './progress';

describe('questionProgress', () => {
  it('counts location, level, hand and side as 1/4 to 4/4', () => {
    expect(ONBOARDING_QUESTION_STEPS).toEqual(['location', 'level', 'hand', 'side']);
    expect(questionProgress('location')).toEqual({ n: 1, total: 4 });
    expect(questionProgress('level')).toEqual({ n: 2, total: 4 });
    expect(questionProgress('hand')).toEqual({ n: 3, total: 4 });
    expect(questionProgress('side')).toEqual({ n: 4, total: 4 });
  });

  it('follows the list it is given', () => {
    expect(questionProgress('side', ['hand', 'side'])).toEqual({ n: 2, total: 2 });
  });
});
