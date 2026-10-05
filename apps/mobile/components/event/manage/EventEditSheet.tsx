/**
 * Manage Event's edit sheets (UX-MEVT-04..08): one sheet per piece of information, each holding
 * only that piece's settings — never the creation steps as one form. The bodies ARE the wizard's
 * steps (Scoring, Location, Courts, Date, Preferences) in their `edit` context.
 *
 * What cannot be edited (UX-MEVT-09) is absent from every sheet: format, modality and group are
 * shown read-only on the dashboard; the organizer's role is set at creation (decision 8).
 *
 * Every sheet edits a copy of the WHOLE event and saves all of it (`useSaveEvent`), since
 * update_event replaces every editable column. Only date and location changes notify the confirmed
 * players — update_event decides that, not the sheet.
 *
 * Recurring events (UX-MEVT-08/22): saving Date & Time, Location & Courts or Preferences first
 * asks the scope — this occurrence only, or this and upcoming ones (update_event's p_scope) — in
 * the same sheet, as a second step. Date & Time's "Repeat every week" is a real toggle: turning it
 * off asks for confirmation (the later occurrences are cancelled) before set_event_recurrence
 * (off); turning it on calls set_event_recurrence (on) after the date is saved, and a plan-cap
 * refusal (`recurring_events`) hands over to the caller's UpgradePrompt (`onUpgrade`).
 */
import { useSetEventRecurrence, type EventDetail, type UpdateEventScope } from '@padel/api';
import { useT } from '@padel/i18n';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type { EventDraft } from '../wizard/draft';
import {
  validateStep4,
  validateStep5,
  validateStep6,
  validateStep7,
  validateStep8,
  validateStep9,
} from '../wizard/stepValidators';
import { Step4Scoring } from '../wizard/steps/Step4Scoring';
import { CourtsBelowRoster, NoLocationFooter, Step5Location } from '../wizard/steps/Step5Location';
import { Step6Courts } from '../wizard/steps/Step6Courts';
import { DateSummaryFooter, deriveSeries, Step7Schedule } from '../wizard/steps/Step7Schedule';
import { Step8Preferences } from '../wizard/steps/Step8Preferences';
import { space } from '../../../theme';
import { Button, Card, Field, RadioCardGroup, Text } from '../../ui';
import { courtsBelowRoster, draftFromEvent } from './eventDraft';
import { ManageSheet } from './ManageSheet';
import { useSaveEvent } from './useSaveEvent';

export type EditSheetKind = 'general' | 'preferences' | 'scoring' | 'location' | 'date';

export const EDIT_SHEET_KINDS: readonly EditSheetKind[] = ['general', 'preferences', 'scoring', 'location', 'date'];

const TITLE_KEYS: Record<EditSheetKind, string> = {
  general: 'generalInfoTitle',
  preferences: 'step8Title',
  scoring: 'widgetScoring',
  location: 'editLocationCourtsTitle',
  date: 'editDateTimeTitle',
};

/** The failing keys for a sheet's slice of the draft, [] when it can be saved. */
function validate(kind: EditSheetKind, d: EventDraft, confirmedMain: number): string[] {
  switch (kind) {
    case 'general':
      return validateStep9(d);
    case 'preferences':
      return validateStep8(d);
    case 'scoring':
      return validateStep4(d);
    case 'date':
      return validateStep7(d);
    case 'location': {
      if (d.locationMode === undefined) return ['locationMode'];
      const errors = [...validateStep5(d), ...validateStep6(d)];
      if (courtsBelowRoster(d.numCourts, confirmedMain)) errors.push('courtsBelowRoster');
      return errors;
    }
  }
}

/** The sheets whose save asks "this occurrence / this and upcoming" on a recurring event. */
const SCOPED: readonly EditSheetKind[] = ['date', 'location', 'preferences'];

type Step = 'edit' | 'scope' | 'repeatOff';

export function EventEditSheet({
  kind,
  event,
  confirmedMain,
  recurring,
  inviteLeadDays,
  courtIds,
  onClose,
  onSaved,
  onUpgrade,
}: {
  kind: EditSheetKind;
  event: EventDetail;
  /** The registry courts the event uses (`useEventCourts`), for Edit Location & Courts. */
  courtIds?: string[];
  /** Confirmed players holding a main spot (stand-by excluded), as update_event counts them. */
  confirmedMain: number;
  recurring: boolean;
  /** An existing series' invitation lead (`useEventSeries`). */
  inviteLeadDays?: number;
  onClose: () => void;
  onSaved: () => void;
  /** Turning recurrence on hit the community's recurring-events cap. */
  onUpgrade?: () => void;
}) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const save = useSaveEvent(event);
  const setRecurrence = useSetEventRecurrence(event.id);
  const [initial] = useState<EventDraft>(() => {
    const d = draftFromEvent(event, courtIds);
    // Date & Time shows the series as its Repeat toggle's state.
    if (kind !== 'date' || !recurring) return d;
    const lead = (inviteLeadDays ?? 7) as NonNullable<EventDraft['series']>['inviteLeadDays'];
    return { ...d, series: deriveSeries(d.startsAt, d.durationMinutes, lead) };
  });
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [step, setStep] = useState<Step>('edit');
  const [scope, setScope] = useState<UpdateEventScope>('only_this');
  // Stable: Step6Courts runs an effect on it.
  const patch = useCallback((p: Partial<EventDraft>) => setDraft((prev) => ({ ...prev, ...p })), []);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearError = useCallback((key: string) => setErrors((prev) => prev.filter((k) => k !== key)), []);

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
          scope: saveScope,
          ...(kind === 'location' ? { courts: { courtName: (n: number) => t('courtNamePlaceholder', { number: n }) } } : {}),
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
      setMessage(t(code));
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (step === 'scope') return commit(scope);
    if (step === 'repeatOff') return commit('only_this');
    const failing = validate(kind, draft, confirmedMain);
    if (failing.length > 0) {
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

  const bodyProps = { draft, patch, errors, clearError };
  let body: React.ReactNode;
  switch (kind) {
    case 'general':
      body = <GeneralInfoBody {...bodyProps} disabled={busy} />;
      break;
    case 'preferences':
      body = <Step8Preferences {...bodyProps} context="edit" />;
      break;
    case 'scoring':
      body = <Step4Scoring {...bodyProps} />;
      break;
    case 'location':
      body = <LocationBody {...bodyProps} />;
      break;
    case 'date':
      body = (
        <>
          <Step7Schedule {...bodyProps} context="edit" recurring={recurring} />
          <DateSummaryFooter {...bodyProps} />
        </>
      );
      break;
  }
  if (step === 'scope') {
    body = (
      <View style={styles.stack}>
        <Text variant="body" tone="muted">
          {t('editScopeBody')}
        </Text>
        <RadioCardGroup<UpdateEventScope>
          options={[
            { value: 'only_this', title: t('scopeOnlyThis') },
            { value: 'this_and_upcoming', title: t('scopeThisAndUpcoming') },
          ]}
          value={scope}
          onChange={setScope}
          testID="edit-scope"
        />
      </View>
    );
  } else if (step === 'repeatOff') {
    body = (
      <Text variant="body" tone="muted" testID="repeat-off-body">
        {t('repeatOffBody')}
      </Text>
    );
  }

  return (
    <ManageSheet
      title={step === 'scope' ? t('editScopeTitle') : step === 'repeatOff' ? t('repeatOffTitle') : t(TITLE_KEYS[kind])}
      // A second step's Cancel goes back to the edit, not out of the sheet.
      onClose={step === 'edit' || busy ? onClose : () => setStep('edit')}
      primaryLabel={step === 'repeatOff' ? t('repeatOffConfirm') : t('sheetSave')}
      destructive={step === 'repeatOff'}
      onPrimary={() => void onSave()}
      busy={busy}
      error={message}
      testID={`sheet-${kind}`}
    >
      {body}
    </ManageSheet>
  );
}

export type BodyProps = {
  draft: EventDraft;
  patch: (p: Partial<EventDraft>) => void;
  errors: string[];
  clearError: (key: string) => void;
};

/** General Info (UX-MEVT-04): name, optional description, thumbnail. */
function GeneralInfoBody({ draft, patch, errors, clearError, disabled }: BodyProps & { disabled: boolean }) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const storedUrl = draft.thumbnailPath
    ? supabase.storage.from('event-thumbnails').getPublicUrl(draft.thumbnailPath).data.publicUrl
    : null;
  const onPick = () => {
    void (async () => {
      const picked = await pickAndValidateImage().catch(() => null);
      if (picked) patch({ thumbnail: picked });
    })();
  };
  return (
    <View style={styles.stack}>
      <Field
        label={t('nameLabel')}
        required
        value={draft.name}
        onChangeText={(name) => {
          patch({ name });
          clearError('name');
        }}
        placeholder={t('namePlaceholder')}
        maxLength={80}
        error={errors.includes('name') ? tc('required') : undefined}
        testID="general-name"
      />
      <Field
        label={t('descriptionOptionalLabel')}
        value={draft.description ?? ''}
        onChangeText={(description) => patch({ description })}
        placeholder={t('descriptionPlaceholder')}
        maxLength={500}
        multiline
        testID="general-description"
      />
      <ImagePickerRow
        label={t('thumbnailLabel')}
        variant="cover"
        uri={draft.thumbnail?.uri ?? storedUrl}
        onPress={onPick}
        // Clearing both the new pick and the stored path sends thumbnail_path null.
        onRemove={() => patch({ thumbnail: null, thumbnailPath: undefined })}
        disabled={disabled}
      />
    </View>
  );
}

/**
 * Edit Location & Courts (UX-MEVT-07): the creation step's three scenarios. A registry venue or no
 * location opens on the courts (a venue's courts to tick, or the count), with the place above it and "Change location" back to the
 * venue list; the manual venue form carries its own count. Capacity may not drop below the
 * confirmed players (`courtsBelowRoster`); when no option fits, the organizer cancels instead.
 */
export function LocationBody({ draft, patch, errors, clearError }: BodyProps) {
  const { t } = useT('event');
  const [page, setPage] = useState<'list' | 'courts'>(
    draft.locationMode === 'registry' || draft.locationMode === 'none' ? 'courts' : 'list',
  );
  const props = { draft, patch, errors, clearError };

  if (draft.locationMode === 'manual') return <Step5Location {...props} context="edit" />;

  if (page === 'list' || draft.locationMode === undefined) {
    const advance = (p?: Partial<EventDraft>) => {
      if (p) patch(p);
      clearError('locationMode');
      setPage('courts');
    };
    return (
      <View style={styles.stack}>
        <Step5Location {...props} advance={advance} context="edit" />
        <NoLocationFooter {...props} advance={advance} />
      </View>
    );
  }

  const placeName = draft.hasLocation ? (draft.manualLocationName ?? draft.manualLocationAddress ?? '') : t('noLocationValue');
  return (
    <View style={styles.stack}>
      <Card padding="md" style={styles.place}>
        <Text variant="label" tone="muted">
          {t('locationCardTitle')}
        </Text>
        <Text variant="bodyStrong" testID="location-sheet-place">
          {placeName}
        </Text>
        <Button
          label={t('changeLocationCta')}
          variant="tertiary"
          onPress={() => setPage('list')}
          style={styles.change}
          testID="location-sheet-change"
        />
      </Card>
      <Step6Courts {...props} />
      <CourtsBelowRoster errors={errors} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[4] },
  place: { gap: space[1] },
  change: { alignSelf: 'flex-start' },
});
