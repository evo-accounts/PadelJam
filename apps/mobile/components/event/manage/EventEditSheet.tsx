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
 */
import type { EventDetail } from '@padel/api';
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
import { DateSummaryFooter, Step7Schedule } from '../wizard/steps/Step7Schedule';
import { Step8Preferences } from '../wizard/steps/Step8Preferences';
import { space } from '../../../theme';
import { Button, Card, Field, Text } from '../../ui';
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

export function EventEditSheet({
  kind,
  event,
  confirmedMain,
  recurring,
  onClose,
  onSaved,
}: {
  kind: EditSheetKind;
  event: EventDetail;
  /** Confirmed players holding a main spot (stand-by excluded), as update_event counts them. */
  confirmedMain: number;
  recurring: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const save = useSaveEvent(event);
  const [draft, setDraft] = useState<EventDraft>(() => draftFromEvent(event));
  // Stable: Step6Courts runs an effect on it.
  const patch = useCallback((p: Partial<EventDraft>) => setDraft((prev) => ({ ...prev, ...p })), []);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clearError = useCallback((key: string) => setErrors((prev) => prev.filter((k) => k !== key)), []);

  const onSave = async () => {
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
    setBusy(true);
    try {
      await save(draft);
      onSaved();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'courts_below_roster') setErrors(['courtsBelowRoster']);
      setMessage(t(code));
      setBusy(false);
    }
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
          {/* TODO(0123, M5): ask "this occurrence / this and upcoming" before saving. */}
          {recurring ? (
            <Text variant="caption" tone="muted">
              {t('editDateOnlyThis')}
            </Text>
          ) : null}
          <DateSummaryFooter {...bodyProps} />
        </>
      );
      break;
  }

  return (
    <ManageSheet
      title={t(TITLE_KEYS[kind])}
      onClose={onClose}
      primaryLabel={t('sheetSave')}
      onPrimary={() => void onSave()}
      busy={busy}
      error={message}
      testID={`sheet-${kind}`}
    >
      {body}
    </ManageSheet>
  );
}

type BodyProps = {
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
 * location opens on the court count, with the place above it and "Change location" back to the
 * venue list; the manual venue form carries its own count. Capacity may not drop below the
 * confirmed players (`courtsBelowRoster`); when no option fits, the organizer cancels instead.
 */
function LocationBody({ draft, patch, errors, clearError }: BodyProps) {
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
      <Step6Courts {...props} context="edit" />
      <CourtsBelowRoster errors={errors} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[4] },
  place: { gap: space[1] },
  change: { alignSelf: 'flex-start' },
});
