'use client';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useCreateEvent, useCanCreateEvent, createEventSchema } from '@padel/api';
import { defaultWizardDraft, stepIsValid, draftToCreateInput, type WizardDraft } from '@padel/utils';
import { uploadCommunityImage } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from '@/components/event/wizard/StepIndicator';
import { Step1Group } from '@/components/event/wizard/steps/Step1Group';
import { Step2Type } from '@/components/event/wizard/steps/Step2Type';
import { Step3Spec } from '@/components/event/wizard/steps/Step3Spec';
import { Step4Scoring } from '@/components/event/wizard/steps/Step4Scoring';
import { Step5Location } from '@/components/event/wizard/steps/Step5Location';
import { Step6Courts } from '@/components/event/wizard/steps/Step6Courts';
import { Step7Schedule } from '@/components/event/wizard/steps/Step7Schedule';
import { Step8Preferences } from '@/components/event/wizard/steps/Step8Preferences';
import { Step9Details } from '@/components/event/wizard/steps/Step9Details';
import { Step10Invite } from '@/components/event/wizard/steps/Step10Invite';
import type { StepProps } from '@/components/event/wizard/types';

const TOTAL = 10;

export default function EventCreatePage() {
  const { id } = useParams<{ id: string }>();
  const presetGroup = useSearchParams().get('groupId');
  const { t } = useT('event');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const create = useCreateEvent();
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    ...defaultWizardDraft,
    groupId: presetGroup ?? null,
  }));
  const canCreate = useCanCreateEvent(draft.groupId ?? '');
  const [stepIndex, setStepIndex] = useState(0);
  const [nowMs] = useState(() => Date.now());
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const patch = (partial: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...partial }));

  const stepNo = stepIndex + 1;
  const canAdvance = useMemo(
    () => stepIsValid[stepNo as keyof typeof stepIsValid]?.(draft, nowMs) ?? true,
    [stepNo, draft, nowMs],
  );
  const isLast = stepIndex === TOTAL - 1;
  const overLimit = draft.groupId != null && canCreate.data === false;

  // Shared props consumed by the real step components.
  const stepProps: StepProps = { draft, patch, communityId: id };

  const onSubmit = async () => {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      let thumbnailPath: string | undefined;
      if (thumbFile && uid) {
        try {
          thumbnailPath = await uploadCommunityImage(thumbFile, uid, 'event-thumbnails');
        } catch {
          /* non-fatal */
        }
      }
      const parsed = createEventSchema.safeParse(draftToCreateInput(draft, thumbnailPath));
      if (!parsed.success) {
        setSubmitErr(t(parsed.error.issues[0]?.message ?? 'unknown_error'));
        setSubmitting(false);
        return;
      }
      const newId = (await create.mutateAsync(parsed.data)) as string;
      router.replace(`/app/event/${newId}`);
    } catch (e) {
      setSubmitErr(t(e instanceof Error ? e.message : 'unknown_error'));
      setSubmitting(false);
    }
  };

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
          {stepNo === 7 ? <Step7Schedule {...stepProps} /> : null}
          {stepNo === 8 ? <Step8Preferences {...stepProps} /> : null}
          {stepNo === 9 ? (
            <Step9Details {...stepProps} onThumbnail={setThumbFile} thumbFile={thumbFile} />
          ) : null}
          {stepNo === 10 ? <Step10Invite {...stepProps} /> : null}
        </CardContent>
      </Card>
      {submitErr ? <p className="text-sm text-destructive">{submitErr}</p> : null}
      <div className="flex justify-between">
        <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
          {t('backCta')}
        </Button>
        {isLast ? (
          <Button disabled={!canAdvance || submitting || overLimit} onClick={onSubmit}>
            {t('createEventCta')}
          </Button>
        ) : (
          <Button disabled={!canAdvance} onClick={() => setStepIndex((i) => i + 1)}>
            {t('nextCta')}
          </Button>
        )}
      </div>
    </div>
  );
}
