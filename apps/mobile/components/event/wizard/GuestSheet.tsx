import { useT } from '@padel/i18n';
import { guestBlocker, type RosterRoom } from '@padel/utils';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../../theme';
import { BottomSheet, Button, Field, Segmented, Text } from '../../ui';
import { InfoNote } from './InfoNote';

type Gender = 'male' | 'female';

/**
 * "+ Add manually" (UX-CEVT-11, decision 7): a guest is a name — and, on a mixed event, a gender —
 * for someone with no access to the app. Saving adds them straight to the step's confirmed list.
 * Validated on Save (UX-GLOB-06), and refused here when they would not fit, so the organizer
 * learns it now rather than from `create_event`.
 */
export function GuestSheet({
  visible,
  onClose,
  mixed,
  room,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  mixed: boolean;
  room: RosterRoom;
  onSave: (guest: { name: string; gender?: Gender }) => void;
}) {
  const { t } = useT('event');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [errors, setErrors] = useState<string[]>([]);

  // Each opening starts empty: whatever was typed goes when the sheet closes or saves.
  const reset = () => {
    setName('');
    setGender('');
    setErrors([]);
  };
  const close = () => {
    reset();
    onClose();
  };

  const blocker = guestBlocker(room, mixed ? gender || null : null);

  const save = () => {
    const failing: string[] = [];
    if (!name.trim()) failing.push('name');
    if (mixed && !gender) failing.push('gender');
    if (blocker) failing.push('capacity');
    setErrors(failing);
    if (failing.length) return;
    onSave({ name, gender: mixed && gender ? gender : undefined });
    reset();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={t('guestSheetTitle')} testID="guest-sheet">
      <View style={styles.body}>
        <Field
          label={t('guestNameLabel')}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setErrors((e) => e.filter((k) => k !== 'name'));
          }}
          placeholder={t('guestNamePlaceholder')}
          maxLength={60}
          autoCapitalize="words"
          error={errors.includes('name') ? t('guestNameRequired') : undefined}
          testID="guest-name"
        />
        {mixed ? (
          <View style={styles.gender}>
            <Text variant="label">{t('guestGenderLabel')}</Text>
            <Segmented<Gender | ''>
              options={[
                { value: 'male', label: t('genderMale') },
                { value: 'female', label: t('genderFemale') },
              ]}
              value={gender}
              onChange={(g) => {
                setGender(g);
                setErrors((e) => e.filter((k) => k !== 'gender' && k !== 'capacity'));
              }}
              testID="guest-gender"
            />
            {errors.includes('gender') ? (
              <Text variant="caption" tone="destructive" accessibilityRole="alert">
                {t('guestGenderRequired')}
              </Text>
            ) : null}
          </View>
        ) : null}
        {errors.includes('capacity') && blocker ? (
          <InfoNote
            tone="warning"
            text={blocker === 'gender_full' ? t('guestGenderFull') : t('guestEventFull')}
            testID="guest-capacity-warning"
          />
        ) : null}
        <InfoNote text={t('guestNote')} testID="guest-note" />
        <Button label={t('guestSave')} fullWidth onPress={save} testID="guest-save" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3] },
  gender: { gap: space[2] },
});
