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
 */
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import { stepIsValid, type WizardDraft } from '@padel/utils';
import type { EventDetail } from '@padel/api';
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

export function EventEditDialog({
  kind,
  event,
  confirmedMain,
  recurring,
  courtIds,
  onClose,
  onSaved,
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
}) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const save = useSaveEvent(event);
  const nowMs = useNow(60_000);
  const [draft, setDraft] = useState<ManageDraft>(() => draftFromEvent(event, courtIds));
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

  const onSave = async () => {
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
    setBusy(true);
    try {
      await save(draft, {
        thumbnail: thumb === undefined ? undefined : (thumb?.file ?? null),
        courts: kind === 'location' ? { courtName: (number) => t('courtNamePlaceholder', { number }) } : undefined,
      });
      onSaved();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'courts_below_roster') setErrors(['courtsBelowRoster']);
      setMessage(t(code, { defaultValue: t('unknown_error') }));
      setBusy(false);
    }
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
          {/* TODO(0123, W5): ask "this occurrence / this and upcoming" before saving. */}
          {recurring ? <p className="text-sm text-muted-foreground">{t('editDateOnlyThis')}</p> : null}
          <DateSummaryFooter {...stepProps} />
        </>
      );
      break;
  }

  return (
    <ManageDialog
      title={t(TITLE_KEYS[kind])}
      onClose={onClose}
      primaryLabel={t('sheetSave')}
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
