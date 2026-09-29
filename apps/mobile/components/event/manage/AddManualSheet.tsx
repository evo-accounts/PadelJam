/**
 * Add manually (UX-MEVT-11): a guest — someone without the app — created and confirmed for this
 * event only. Reached from the Manage players header on a public group event and from the Invite
 * screen. A single Name field; a mixed event also asks the gender (male / female only — the
 * rotation pairs one of each, UX-MEVT-25), and the guest counts towards that side.
 *
 * `add_manual_participant` (0121) refuses a full event, a full side, a missing gender on a mixed
 * event and a name over 60 characters; each refusal is shown in the sheet (ManageSheet's rule —
 * a banner would sit behind the Modal). Success closes the sheet and the caller raises the banner.
 */
import { useAddManualParticipant } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../../theme';
import { Field, Segmented, Text } from '../../ui';
import { ManageSheet } from './ManageSheet';
import { rosterErrorKey } from './manageRoster';

type Props = {
  eventId: string;
  mixed: boolean;
  onClose: () => void;
  /** Called with the guest's name once they are on the roster. */
  onAdded: (name: string) => void;
};

export function AddManualSheet({ eventId, mixed, onClose, onAdded }: Props) {
  const { t } = useT('event');
  const add = useAddManualParticipant(eventId);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError(t('manualNameRequired'));
      return;
    }
    if (mixed && gender == null) {
      setError(t('mpGenderRequired'));
      return;
    }
    setError(null);
    setNameError(null);
    try {
      await add.mutateAsync({ name: trimmed, gender: mixed && gender ? gender : undefined });
      onAdded(trimmed);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
    }
  };

  return (
    <ManageSheet
      title={t('addManuallyCta')}
      onClose={onClose}
      primaryLabel={t('sheetSave')}
      onPrimary={() => void save()}
      busy={add.isPending}
      error={error}
      testID="sheet-add-manual"
    >
      <Field
        label={t('mpManualNameLabel')}
        value={name}
        onChangeText={(v) => {
          setName(v);
          if (nameError) setNameError(null);
        }}
        error={nameError}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={60}
        returnKeyType="done"
        testID="add-manual-name"
      />
      {mixed ? (
        <View style={styles.gender}>
          <Text variant="label">{t('manualGenderLabel')}</Text>
          <Segmented
            options={[
              { value: 'female' as const, label: t('genderFemale') },
              { value: 'male' as const, label: t('genderMale') },
            ]}
            // Segmented needs a value: nothing is highlighted until one is picked.
            value={gender ?? ('' as 'female')}
            onChange={(g) => {
              setGender(g);
              setError(null);
            }}
            testID="add-manual-gender"
          />
        </View>
      ) : null}
      <View style={styles.note}>
        <Text variant="body" tone="muted">
          {t('mpManualNote')}
        </Text>
        <Text variant="body" tone="muted">
          {t('mpManualNoteNoApp')}
        </Text>
      </View>
    </ManageSheet>
  );
}

const styles = StyleSheet.create({
  gender: { gap: space[2] },
  note: { gap: space[2] },
});
