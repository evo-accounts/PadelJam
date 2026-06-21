'use client';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { defaultWizardDraft, stepIsValid, type WizardDraft } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from '@/components/event/wizard/StepIndicator';
import { Step1Group } from '@/components/event/wizard/steps/Step1Group';
import { Step2Type } from '@/components/event/wizard/steps/Step2Type';
import { Step3Spec } from '@/components/event/wizard/steps/Step3Spec';
import { Step4Scoring } from '@/components/event/wizard/steps/Step4Scoring';
import { Step5Location } from '@/components/event/wizard/steps/Step5Location';
import { Step6Courts } from '@/components/event/wizard/steps/Step6Courts';
import type { StepProps } from '@/components/event/wizard/types';

const TOTAL = 10;

export default function EventCreatePage() {
  const { id } = useParams<{ id: string }>();
  const presetGroup = useSearchParams().get('groupId');
  const { t } = useT('event');
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    ...defaultWizardDraft,
    groupId: presetGroup ?? null,
  }));
  const [stepIndex, setStepIndex] = useState(0);
  const [nowMs] = useState(() => Date.now());
  const patch = (partial: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...partial }));

  const stepNo = stepIndex + 1;
  const canAdvance = useMemo(
    () => stepIsValid[stepNo as keyof typeof stepIsValid]?.(draft, nowMs) ?? true,
    [stepNo, draft, nowMs],
  );
  const isLast = stepIndex === TOTAL - 1;

  // Shared props consumed by the real step components.
  const stepProps: StepProps = { draft, patch, communityId: id };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <StepIndicator stepIndex={stepIndex} total={TOTAL} />
      <Card>
        <CardContent className="py-6">
          {stepNo === 1 ? <Step1Group {...stepProps} /> : null}
          {stepNo === 2 ? <Step2Type {...stepProps} /> : null}
          {stepNo === 3 ? <Step3Spec {...stepProps} /> : null}
          {stepNo === 4 ? <Step4Scoring {...stepProps} /> : null}
          {stepNo === 5 ? <Step5Location {...stepProps} /> : null}
          {stepNo === 6 ? <Step6Courts {...stepProps} /> : null}
          {stepNo >= 7 ? <p className="text-sm text-muted-foreground">{t(`step${stepNo}Title`)}</p> : null}
        </CardContent>
      </Card>
      <div className="flex justify-between">
        <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
          {t('backCta')}
        </Button>
        {isLast ? (
          <Button disabled={!canAdvance}>{t('createEventCta')}</Button>
        ) : (
          <Button disabled={!canAdvance} onClick={() => setStepIndex((i) => i + 1)}>
            {t('nextCta')}
          </Button>
        )}
      </div>
    </div>
  );
}
