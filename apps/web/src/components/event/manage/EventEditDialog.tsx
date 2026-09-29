'use client';
/**
 * Manage Event's edit dialogs (UX-MEVT-04..08): one dialog per piece of information, each holding
 * only that piece's settings — never the creation steps as one form. The bodies ARE the web
 * wizard's steps (Scoring, Location, Courts, Date, Preferences) in their `edit` context, as mobile's
 * sheets are its wizard steps.
 *
 * What cannot be edited (UX-MEVT-09) is absent from every dialog: format, modality and group are
 * shown read-only on the dashboard; the organizer's role is set at creation (decision 8).
 *
 * Every dialog edits a copy of the WHOLE event and saves all of it (`useSaveEvent`), since
 * update_event replaces every editable column. Only date and location changes notify the confirmed
 * players — update_event decides that, not the dialog.
 *
 * Recurring events (UX-MEVT-08/22): saving Date & Time, Location & Courts or Preferences first
 * asks the scope — this occurrence only, or this and upcoming ones (update_event's p_scope) — in
 * the same dialog, as a second step. Date & Time's "Repeat every week" is a real switch: turning it
 * off asks for confirmation (the later occurrences are cancelled) before set_event_recurrence
 * (off); turning it on calls set_event_recurrence (on) after the date is saved, and a plan-cap
 * refusal (`recurring_events`) hands over to the caller's UpgradePrompt (`onUpgrade`).
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import { stepIsValid, type WizardDraft } from '@padel/utils';
import { useSetEventRecurrence, type EventDetail, type UpdateEventScope } from '@padel/api';
import { DEFAULT_INVITE_LEAD } from '@padel/utils';
import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { eventThumbnailUrl } from '@/lib/community-images';
import { useNow } from '@/lib/useNow';
import {
  courtsErrors,
  dateErrors,
  deriveSeries,
  detailsErrors,
  locationErrors,
  preferencesErrors,
} from '../wizard/draft-logic';
import { FieldError } from '../wizard/FieldError';
import { Step4Scoring } from '../wizard/steps/Step4Scoring';
import { CourtsBelowRoster, NoLocationFooter, Step5Location } from '../wizard/steps/Step5Location';
import { Step6Courts } from '../wizard/steps/Step6Courts';
import { DateSummaryFooter, Step7Schedule } from '../wizard/steps/Step7Schedule';
import { Step8Preferences } from '../wizard/steps/Step8Preferences';
import type { StepProps, WebWizardDraft } from '../wizard/types';
import { courtsBelowRoster, draftFromEvent, type ManageDraft } from './eventDraft';
import { ManageDialog } from './ManageDialog';
import { RadioCards } from './RadioCards';
import { useSaveEvent } from './useSaveEvent';

export type EditDialogKind = 'general' | 'preferences' | 'scoring' | 'location' | 'date';

export const EDIT_DIALOG_KINDS: readonly EditDialogKind[] = ['general', 'preferences', 'scoring', 'location', 'date'];

const TITLE_KEYS: Record<EditDialogKind, string> = {
  general: 'generalInfoTitle',
  preferences: 'step8Title',
  scoring: 'widgetScoring',
  location: 'editLocationCourtsTitle',
  date: 'editDateTimeTitle',
};

/** The failing keys for a dialog's slice of the draft, [] when it can be saved. */
function validate(kind: EditDialogKind, d: ManageDraft, confirmedMain: number, nowMs: number): string[] {
  switch (kind) {
    case 'general':
      return detailsErrors(d);
    case 'preferences':
      return preferencesErrors(d);
    case 'scoring':
      return stepIsValid[4](d as WizardDraft, nowMs) ? [] : ['scoring'];
    case 'date':
      return dateErrors(d, nowMs);
    case 'location': {
      if (d.locationMode === undefined) return ['locationMode'];
      const errors = [...locationErrors(d), ...(d.locationMode === 'manual' ? [] : courtsErrors(d))];
      if (courtsBelowRoster(d.numCourts, confirmedMain)) errors.push('courtsBelowRoster');
      return errors;
    }
  }
}

/** The dialogs whose save asks "this occurrence / this and upcoming" on a recurring event. */
const SCOPED: readonly EditDialogKind[] = ['date', 'location', 'preferences'];

type Step = 'edit' | 'scope' | 'repeatOff';

export function EventEditDialog({
  kind,
  event,
  confirmedMain,
  recurring,
  courtIds,
  onClose,
  onSaved,
  onUpgrade,
}: {
  kind: EditDialogKind;
  event: EventDetail;
  /** Confirmed players holding a main spot (stand-by excluded), as update_event counts them. */
  confirmedMain: number;
  recurring: boolean;
  /** The registry courts the event uses (`useEventCourts`), for Edit Location & Courts. */
  courtIds?: string[];
  onClose: () => void;
  onSaved: () => void;
  /** Turning recurrence on hit the community's recurring-events cap. */
  onUpgrade?: () => void;
}) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const save = useSaveEvent(event);
  const setRecurrence = useSetEventRecurrence(event.id);
  const nowMs = useNow(60_000);
  const [initial] = useState<ManageDraft>(() => {
    const d = draftFromEvent(event, courtIds);
    // Date & Time shows the series as its Repeat switch's state (an existing series keeps its lead).
    if (kind !== 'date' || !recurring) return d;
    return { ...d, series: deriveSeries(d.startsAt, d.durationMinutes, DEFAULT_INVITE_LEAD) };
  });
  const [draft, setDraft] = useState<ManageDraft>(initial);
  const [step, setStep] = useState<Step>('edit');
  const [scope, setScope] = useState<UpdateEventScope>('only_this');
  // Stable: Step6Courts runs an effect on it.
  const patch = useCallback((p: Partial<WebWizardDraft>) => setDraft((prev) => ({ ...prev, ...p })), []);
  const [flagged, setFlagged] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // General Info: a newly picked file (undefined = unchanged, null = removed) and its preview.
  const [thumb, setThumb] = useState<{ file: File; url: string } | null | undefined>(undefined);
  useEffect(() => () => {
    if (thumb) URL.revokeObjectURL(thumb.url);
  }, [thumb]);

  // Date & Time: did the organizer flip Repeat every week, or move the date?
  const repeatOn = draft.series != null;
  const repeatChanged = kind === 'date' && draft.groupId != null && repeatOn !== recurring;
  const dateChanged =
    kind === 'date' && (draft.startsAt !== initial.startsAt || draft.durationMinutes !== initial.durationMinutes);

  const commit = async (saveScope: UpdateEventScope) => {
    setMessage(null);
    setBusy(true);
    try {
      if (repeatChanged && !repeatOn) await setRecurrence.mutateAsync({ on: false, groupId: event.group_id });
      // Flipping Repeat alone saves nothing else; turning it on saves the date first, so the new
      // series hangs off the date just picked.
      if (!(repeatChanged && !dateChanged)) {
        await save(draft, {
          thumbnail: thumb === undefined ? undefined : (thumb?.file ?? null),
          courts: kind === 'location' ? { courtName: (number) => t('courtNamePlaceholder', { number }) } : undefined,
          scope: saveScope,
        });
      }
      if (repeatChanged && repeatOn) {
        await setRecurrence.mutateAsync({
          on: true,
          inviteLeadDays: draft.series?.inviteLeadDays ?? null,
          groupId: event.group_id,
        });
      }
      onSaved();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'recurring_events' && onUpgrade) return onUpgrade();
      if (code === 'courts_below_roster') setErrors(['courtsBelowRoster']);
      setStep('edit');
      setMessage(t(code, { defaultValue: t('unknown_error') }));
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (step === 'scope') return commit(scope);
    if (step === 'repeatOff') return commit('only_this');
    const failing = validate(kind, draft, confirmedMain, nowMs);
    if (failing.length > 0) {
      setFlagged(true);
      setErrors(failing);
      setMessage(
        failing.length === 1 && failing[0] === 'courtsBelowRoster' ? t('courts_below_roster') : tc('missingInformation'),
      );
      return;
    }
    setErrors([]);
    setMessage(null);
    if (repeatChanged && !repeatOn) return setStep('repeatOff');
    // A recurring event asks the scope — except for a Date & Time save that moved nothing.
    const asks = recurring && SCOPED.includes(kind) && !repeatChanged && (kind !== 'date' || dateChanged);
    if (asks) return setStep('scope');
    return commit('only_this');
  };

  const stepProps: StepProps = { draft, patch, communityId: '', flagged, nowMs };
  let body: React.ReactNode;
  switch (kind) {
    case 'general': {
      const stored = draft.thumbnailPath ? eventThumbnailUrl(draft.thumbnailPath) : null;
      body = (
        <GeneralInfoBody
          draft={draft}
          patch={patch}
          flagged={flagged}
          disabled={busy}
          previewUrl={thumb === undefined ? stored : (thumb?.url ?? null)}
          onPick={(file) => setThumb({ file, url: URL.createObjectURL(file) })}
          onRemove={() => {
            setThumb(null);
            patch({ thumbnailPath: undefined } as Partial<ManageDraft>);
          }}
        />
      );
      break;
    }
    case 'preferences':
      body = <Step8Preferences {...stepProps} context="edit" />;
      break;
    case 'scoring':
      body = <Step4Scoring {...stepProps} />;
      break;
    case 'location':
      body = <LocationBody {...stepProps} courtsBelow={errors.includes('courtsBelowRoster')} />;
      break;
    case 'date':
      body = (
        <>
          <Step7Schedule {...stepProps} context="edit" recurring={recurring} />
          <DateSummaryFooter {...stepProps} />
        </>
      );
      break;
  }

  if (step === 'scope') {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('editScopeBody')}</p>
        <RadioCards<UpdateEventScope>
          label={t('editScopeTitle')}
          options={[
            { value: 'only_this', title: t('scopeOnlyThis') },
            { value: 'this_and_upcoming', title: t('scopeThisAndUpcoming') },
          ]}
          value={scope}
          onChange={setScope}
          testId="edit-scope"
        />
      </div>
    );
  } else if (step === 'repeatOff') {
    body = (
      <p className="text-sm text-muted-foreground" data-testid="repeat-off-body">
        {t('repeatOffBody')}
      </p>
    );
  }

  return (
    <ManageDialog
      title={step === 'scope' ? t('editScopeTitle') : step === 'repeatOff' ? t('repeatOffTitle') : t(TITLE_KEYS[kind])}
      // A second step's Cancel goes back to the edit, not out of the dialog.
      onClose={step === 'edit' || busy ? onClose : () => setStep('edit')}
      primaryLabel={step === 'repeatOff' ? t('repeatOffConfirm') : t('sheetSave')}
      destructive={step === 'repeatOff'}
      onPrimary={() => void onSave()}
      busy={busy}
      error={message}
      testId={`sheet-${kind}`}
    >
      {body}
    </ManageDialog>
  );
}

/** General Info (UX-MEVT-04): name, optional description, thumbnail. */
function GeneralInfoBody({
  draft,
  patch,
  flagged,
  disabled,
  previewUrl,
  onPick,
  onRemove,
}: {
  draft: ManageDraft;
  patch: (p: Partial<WebWizardDraft>) => void;
  flagged: boolean;
  disabled: boolean;
  previewUrl: string | null;
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  const { t } = useT('event');
  const badName = flagged && detailsErrors(draft).includes('name');
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="general-name">
          {t('nameLabel')}
          <span aria-hidden className="text-destructive">
            *
          </span>
        </Label>
        <Input
          id="general-name"
          required
          maxLength={80}
          aria-invalid={badName || undefined}
          aria-describedby={badName ? 'general-name-error' : undefined}
          placeholder={t('namePlaceholder')}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          data-testid="general-name"
        />
        <FieldError id="general-name-error" show={badName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="general-description">{t('descriptionOptionalLabel')}</Label>
        <Textarea
          id="general-description"
          maxLength={500}
          placeholder={t('descriptionPlaceholder')}
          value={draft.description ?? ''}
          onChange={(e) => patch({ description: e.target.value })}
          data-testid="general-description"
        />
      </div>
      <ImagePickerRow
        id="general-thumbnail"
        label={t('thumbnailLabel')}
        previewUrl={previewUrl}
        onPick={onPick}
        onRemove={onRemove}
        disabled={disabled}
        labels={{ upload: t('uploadImageCta'), change: t('changeImageCta'), remove: t('removeImageCta') }}
        testId="general-thumbnail"
      />
    </div>
  );
}

/**
 * Edit Location & Courts (UX-MEVT-07): the creation step's three scenarios. A registry venue or no
 * location opens on the courts (a venue's courts to tick, or the count), with the place above it
 * and "Change location" back to the venue list; the manual venue form carries its own count.
 * Capacity may not drop below the confirmed players; when no option fits, the organizer cancels.
 * Also Duplicate's Location & courts section (UX-MEVT-20).
 */
export function LocationBody(props: StepProps & { courtsBelow?: boolean }) {
  const { draft, patch, courtsBelow = false } = props;
  const { t } = useT('event');
  const [page, setPage] = useState<'list' | 'courts'>(
    draft.locationMode === 'registry' || draft.locationMode === 'none' ? 'courts' : 'list',
  );

  if (draft.locationMode === 'manual') return <Step5Location {...props} context="edit" courtsBelow={courtsBelow} />;

  if (page === 'list' || draft.locationMode === undefined) {
    const advance = (p?: Partial<WebWizardDraft>) => {
      if (p) patch(p);
      setPage('courts');
    };
    return (
      <div className="flex flex-col gap-4">
        <Step5Location {...props} advance={advance} context="edit" />
        <NoLocationFooter {...props} advance={advance} />
      </div>
    );
  }

  const placeName = draft.hasLocation
    ? (draft.manualLocationName ?? draft.manualLocationAddress ?? '')
    : t('noLocationValue');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg border p-4">
        <span className="text-xs font-medium text-muted-foreground">{t('locationCardTitle')}</span>
        <span className="font-medium" data-testid="location-sheet-place">
          {placeName}
        </span>
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          className="-ml-2 self-start"
          onClick={() => setPage('list')}
          data-testid="location-sheet-change"
        >
          {t('changeLocationCta')}
        </Button>
      </div>
      <Step6Courts {...props} />
      <CourtsBelowRoster show={courtsBelow} />
    </div>
  );
}
