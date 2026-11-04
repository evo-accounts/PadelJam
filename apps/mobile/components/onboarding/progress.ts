import { ONBOARDING_QUESTION_STEPS, type OnboardingQuestionStep } from '../../lib/postVerifyRoute';

/**
 * Where a question step sits in the ordered list: `n` of `total`, both 1-based.
 * Derived from `ONBOARDING_QUESTION_STEPS`, so a step added there (Level) moves
 * every bar without anyone editing a screen.
 */
export function questionProgress(
  step: OnboardingQuestionStep,
  steps: readonly OnboardingQuestionStep[] = ONBOARDING_QUESTION_STEPS,
): { n: number; total: number } {
  const index = steps.indexOf(step);
  return { n: index + 1, total: steps.length };
}
