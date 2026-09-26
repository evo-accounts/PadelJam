'use client';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useCreateEvent, createEventSchema } from '@padel/api';
import {
  DEFAULT_DURATION,
  defaultWizardDraft,
  stepIsValid,
  neighbourStep,
  skipsInvite,
  stepProgress,
  visibleStepKeys,
  STEP_KEYS,
  type StepKey,
} from '@padel/utils';
import { uploadCommunityImage } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { toast, useLiftToasts } from '@/components/ui/toaster';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { WizardHeader } from '@/components/event/wizard/WizardHeader';
import { NoGroupFooter, Step1Group } from '@/components/event/wizard/steps/Step1Group';
import { Step2Type } from '@/components/event/wizard/steps/Step2Type';
import { Step3Spec } from '@/components/event/wizard/steps/Step3Spec';
import { Step4Scoring } from '@/components/event/wizard/steps/Step4Scoring';
import { NoLocationFooter, Step5Location } from '@/components/event/wizard/steps/Step5Location';
import { Step6Courts } from '@/components/event/wizard/steps/Step6Courts';
import { DateSummaryFooter, Step7Schedule } from '@/components/event/wizard/steps/Step7Schedule';
import { Step8Preferences } from '@/components/event/wizard/steps/Step8Preferences';
import { Step9Details } from '@/components/event/wizard/steps/Step9Details';
import { Step10Invite } from '@/components/event/wizard/steps/Step10Invite';
import {
  courtsErrors,
  dateErrors,
  locationErrors,
  onEnterStep,
  webCreateInput,
} from '@/components/event/wizard/draft-logic';
import type { StepProps, WebWizardDraft } from '@/components/event/wizard/types';

/**
 * How each step advances (UX-CEVT-01). `tap`: a single choice from a list — the card advances and
 * the step has no primary button (Group and Location bring their own bottom area instead).
 * `button`: more than one value to set — a primary button fixed at the bottom, validated on tap
 * (UX-GLOB-06). Location is a tap list of venues until the manual venue form is opened, which has
 * fields and therefore the button.
 */
const TAP_STEPS: ReadonlySet<StepKey> = new Set(['group', 'format', 'players']);
const isTapStep = (key: StepKey, d: WebWizardDraft) =>
  TAP_STEPS.has(key) || (key === 'location' && d.locationMode !== 'manual');
/**
 * The fixed bottom area's own content. On a tap step it replaces the (absent) primary button —
 * Group's "Continue without group", Location's "I don't want to add a location". On a button step
 * it sits above the primary button and is fixed with it — Date's summary box.
 */
const FOOTERS: Partial<Record<StepKey, ComponentType<StepProps>>> = {
  group: NoGroupFooter,
  location: NoLocationFooter,
  date: DateSummaryFooter,
};
const TITLE_KEY = (key: StepKey) => `step${STEP_KEYS.indexOf(key) + 1}Title`;

/**
 * A card tap that advances puts the NEXT step's cards under the same pointer. A double click, or
 * a second tap while the step swaps, would answer that step too without the organizer seeing it,
 * so presses inside this window after an advance are dropped.
 */
const ADVANCE_GUARD_MS = 300;

/**
 * Standalone events (no group) must be private — enforced by the schema. A newly picked group
 * starts public, as it does when the wizard is opened from a group page; re-picking the SAME
 * group keeps whatever Preferences set. Mirrors mobile's `draftPatch.ts`.
 */
function applyPatch(d: WebWizardDraft, partial: Partial<WebWizardDraft>): WebWizardDraft {
  let forced: Partial<WebWizardDraft> = {};
  if (partial.groupId === null) {
    forced = { isPrivate: true, series: undefined };
  } else if (partial.groupId !== undefined && partial.groupId !== d.groupId) {
    forced = { isPrivate: false };
  }
  return { ...d, ...partial, ...forced };
}

type State = { draft: WebWizardDraft; key: StepKey; touched: boolean };

/**
 * Steps 5–7 validate against the rebuilt Location / Courts / Date (UX-CEVT-06..08), as mobile's
 * `stepValidators.ts` does; the rest use the shared gates.
 */
function stepOk(key: StepKey, d: WebWizardDraft, nowMs: number): boolean {
  if (key === 'location') return locationErrors(d).length === 0;
  if (key === 'courts') return courtsErrors(d).length === 0;
  if (key === 'date') return dateErrors(d, nowMs).length === 0;
  const n = (STEP_KEYS.indexOf(key) + 1) as keyof typeof stepIsValid;
  return stepIsValid[n](d, nowMs);
}

export default function EventCreatePage() {
  const { id } = useParams<{ id: string }>();
  const presetGroup = useSearchParams().get('groupId');
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const create = useCreateEvent();
  const [state, setState] = useState<State>(() => ({
    // Decision 9: 60 is the default duration (the shared default is still 90).
    draft: {
      ...defaultWizardDraft,
      durationMinutes: DEFAULT_DURATION,
      groupId: presetGroup ?? null,
      isPrivate: !presetGroup,
    },
    key: 'group',
    touched: false,
  }));
  const { draft, key } = state;
  const [nowMs] = useState(() => Date.now());
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const lastAdvance = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // The sticky bottom bar would sit under a toast; lift toasts clear of it while the wizard is open.
  // Its height varies (Date's bar also carries the summary, which grows when the event repeats),
  // so it is measured rather than assumed.
  const bottomBar = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useLiftToasts(barHeight > 0 ? barHeight + 8 : 0);

  // After a step change, focus moves to the new step's title, so keyboard and screen-reader users
  // start at the top of the step instead of on a control that no longer exists.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [key]);

  const visible = visibleStepKeys(draft);
  const isFirst = visible[0] === key;
  const isLast = visible[visible.length - 1] === key;
  const isTap = isTapStep(key, draft);
  const Footer = FOOTERS[key];
  const hasBottomBar = !isTap || !!Footer;

  useEffect(() => {
    const el = bottomBar.current;
    if (!hasBottomBar || !el) {
      setBarHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBarHeight(Math.round(entry.borderBoxSize[0]?.blockSize ?? el.offsetHeight));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasBottomBar]);

  // `flagged` stays on while the step is open: each field shows its error only while it is still
  // wrong, so fixing one clears its mark without hiding the others.
  const patch = (partial: Partial<WebWizardDraft>) => {
    setState((s) => ({ ...s, draft: applyPatch(s.draft, partial), touched: true }));
  };

  // One update, so the next step is computed from the draft the tap just produced. Entering a
  // step may seed it (`onEnterStep`: Date opens on the first free slot an hour away).
  const advance = (partial?: Partial<WebWizardDraft>) => {
    const now = Date.now();
    if (now - lastAdvance.current < ADVANCE_GUARD_MS) return;
    lastAdvance.current = now;
    moved.current = true;
    setFlagged(false);
    setState((s) => {
      const d = partial ? applyPatch(s.draft, partial) : s.draft;
      const next = neighbourStep(d, s.key, 1);
      return { draft: onEnterStep(d, next, now), key: next, touched: true };
    });
    window.scrollTo({ top: 0 });
  };

  const back = () => {
    moved.current = true;
    setFlagged(false);
    const now = Date.now();
    setState((s) => {
      const prev = neighbourStep(s.draft, s.key, -1);
      return { ...s, draft: onEnterStep(s.draft, prev, now), key: prev };
    });
    window.scrollTo({ top: 0 });
  };

  // Back where the wizard was opened from: the group page when it came with one, else the previous
  // page, or the community when there is no history to go back to (a pasted link).
  const leave = () => {
    if (presetGroup) router.push(`/app/group/${presetGroup}`);
    else if (window.history.length > 1) router.back();
    else router.push(`/app/community/${id}`);
  };
  // Anything touched — a patch or a step taken — is work the organizer would lose.
  const onClose = () => (state.touched ? setConfirmClose(true) : leave());

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      let thumbnailPath: string | undefined;
      if (thumbFile && uid) {
        try {
          thumbnailPath = await uploadCommunityImage(thumbFile, uid, 'event-thumbnails');
        } catch {
          /* non-fatal */
        }
      }
      // A public group event invites nobody (decision 5): invitees picked before the path
      // changed (the event was made public on Preferences) must not be sent.
      const toSend = skipsInvite(draft) ? { ...draft, invitees: undefined } : draft;
      const parsed = createEventSchema.safeParse(
        webCreateInput(toSend, thumbnailPath, (number) => t('courtNamePlaceholder', { number })),
      );
      if (!parsed.success) {
        toast(t(parsed.error.issues[0]?.message ?? 'unknown_error'), 'error');
        setSubmitting(false);
        return;
      }
      const newId = (await create.mutateAsync(parsed.data)) as string;
      router.replace(`/app/event/${newId}`);
    } catch (e) {
      toast(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }), 'error');
      setSubmitting(false);
    }
  };

  // Validate on tap, never a disabled button (UX-GLOB-06). The last VISIBLE step validates too
  // before it submits — with Invite players skipped, that is Details, whose name is required.
  const onPrimary = () => {
    // A double click on Next would otherwise answer (or submit) the step it just opened.
    if (Date.now() - lastAdvance.current < ADVANCE_GUARD_MS) return;
    // "Still in the future" is checked against the clock now, not when the wizard opened.
    if (!stepOk(key, draft, Math.max(nowMs, Date.now()))) {
      setFlagged(true);
      toast(tc('missingInformation'), 'error');
      return;
    }
    if (isLast) {
      lastAdvance.current = Date.now();
      void onSubmit();
      return;
    }
    advance();
  };

  const stepProps: StepProps = { draft, patch, advance, communityId: id, flagged, nowMs };

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-xl flex-col">
      <div className="px-4 pt-4 sm:px-6">
        <WizardHeader
          title={t('createTitle')}
          progress={stepProgress(draft, key)}
          onBack={isFirst ? undefined : back}
          onClose={onClose}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {/* One title for every step, naming what is being set (UX-CEVT-01). */}
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
          data-testid="event-wizard-title"
        >
          {t(TITLE_KEY(key))}
        </h1>
        {key === 'group' ? <Step1Group {...stepProps} /> : null}
        {key === 'format' ? <Step2Type {...stepProps} /> : null}
        {key === 'players' ? <Step3Spec {...stepProps} /> : null}
        {key === 'scoring' ? <Step4Scoring {...stepProps} /> : null}
        {key === 'location' ? <Step5Location {...stepProps} /> : null}
        {key === 'courts' ? <Step6Courts {...stepProps} /> : null}
        {key === 'date' ? <Step7Schedule {...stepProps} /> : null}
        {key === 'preferences' ? <Step8Preferences {...stepProps} /> : null}
        {key === 'details' ? (
          <Step9Details {...stepProps} onThumbnail={setThumbFile} thumbFile={thumbFile} />
        ) : null}
        {key === 'invite' ? <Step10Invite {...stepProps} /> : null}
      </div>

      {/*
        Fixed to the bottom of the viewport while the step scrolls. Multi-value steps get the
        primary button; a tap step has none unless it brings its own area (Group's "Continue
        without group"). There is no Back button — going back is the header arrow.
      */}
      {hasBottomBar ? (
        <div ref={bottomBar} className="sticky bottom-0 border-t bg-background px-4 py-3 sm:px-6">
          {isTap && Footer ? (
            <Footer {...stepProps} />
          ) : (
            <>
              {Footer ? <Footer {...stepProps} /> : null}
              <Button className="w-full" onClick={onPrimary} disabled={submitting} data-testid="event-wizard-primary">
                {isLast ? t('createEventCta') : t('nextCta')}
              </Button>
            </>
          )}
        </div>
      ) : null}

      <GroupConfirm
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={t('discardTitle')}
        body={t('discardBody')}
        confirmLabel={t('discardConfirm')}
        cancelLabel={t('discardCancel')}
        destructive
        onConfirm={leave}
      />
    </div>
  );
}
