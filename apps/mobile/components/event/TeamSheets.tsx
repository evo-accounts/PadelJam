/**
 * The bottom sheets of the team-event flow (UX-JEVT-09, 10, 13), per UX-GLOB-02.
 *
 *   TeamEventSheet     "Team Event" — how do you want to set your team? I have / I need a partner.
 *   EditResponseSheet  an interested player's "Edit response": found / need a partner, Leave event.
 *   GuestPartnerSheet  "+ Add manually": a partner with no access to the app, for this event only.
 *
 * The choice sheets report the row through `onChoose` only once the Modal has finished closing
 * (`onDismissed`), so the caller can push a screen or open another sheet without racing it.
 */
import { useT } from '@padel/i18n';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { BottomSheet, Button, Field, SheetRow, Text } from '../ui';
import { Chevron } from './EventDetailParts';

export type TeamChoice = 'have' | 'need';
export type EditChoice = TeamChoice | 'leave';

type Row<K extends string> = { key: K; label: string; destructive?: boolean; testID: string };

function ChoiceSheet<K extends string>({
  visible,
  onClose,
  onChoose,
  title,
  body,
  rows,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (key: K) => void;
  title: string;
  body?: string;
  rows: Row<K>[];
  testID: string;
}) {
  const { t } = useT('event');
  const picked = useRef<K | null>(null);
  const pick = (key: K) => {
    picked.current = key;
    onClose();
  };
  const onDismissed = () => {
    const key = picked.current;
    picked.current = null;
    if (key != null) onChoose(key);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} onDismissed={onDismissed} title={title} testID={testID}>
      {body ? (
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
      ) : null}
      {rows.map((r) => (
        <SheetRow
          key={r.key}
          label={r.label}
          destructive={r.destructive}
          trailing={r.destructive ? undefined : <Chevron />}
          onPress={() => pick(r.key)}
          testID={r.testID}
        />
      ))}
      <View style={styles.buttons}>
        <Button label={t('cancel')} variant="ghost" fullWidth onPress={onClose} testID={`${testID}-cancel`} />
      </View>
    </BottomSheet>
  );
}

/** UX-JEVT-09: the sheet behind a team event's "Join" (and the organizer's "Join as a player"). */
export function TeamEventSheet(props: { visible: boolean; onClose: () => void; onChoose: (c: TeamChoice) => void }) {
  const { t } = useT('event');
  return (
    <ChoiceSheet<TeamChoice>
      {...props}
      title={t('teamSheetTitle')}
      body={t('teamSheetBody')}
      rows={[
        { key: 'have', label: t('havePartnerTitle'), testID: 'team-sheet-have' },
        { key: 'need', label: t('needPartnerTitle'), testID: 'team-sheet-need' },
      ]}
      testID="team-sheet"
    />
  );
}

/** UX-JEVT-13: "Edit response" for a player marked interested. */
export function EditResponseSheet(props: { visible: boolean; onClose: () => void; onChoose: (c: EditChoice) => void }) {
  const { t } = useT('event');
  return (
    <ChoiceSheet<EditChoice>
      {...props}
      title={t('editResponseCta')}
      rows={[
        { key: 'have', label: t('foundPartnerRow'), testID: 'edit-response-have' },
        { key: 'need', label: t('needPartnerTitle'), testID: 'edit-response-need' },
        { key: 'leave', label: t('leaveCta'), destructive: true, testID: 'edit-response-leave' },
      ]}
      testID="edit-response-sheet"
    />
  );
}

/**
 * UX-JEVT-10 "Add manually": a guest partner (decision 7) — a name, confirmed for this event only,
 * no history, no ranking, not reusable. Saving confirms the pair like picking a player does.
 */
export function GuestPartnerSheet({
  visible,
  onClose,
  onSave,
  saving,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const { t } = useT('event');
  const [name, setName] = useState('');
  const trimmed = name.trim();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onDismissed={() => setName('')}
      title={t('guestPartnerTitle')}
      testID="guest-partner-sheet"
    >
      <View style={styles.form}>
        <Field
          label={t('guestPartnerNameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          error={error}
          testID="guest-partner-name"
        />
        <Text variant="caption" tone="muted">
          {t('guestPartnerNote')}
        </Text>
      </View>
      <View style={styles.buttons}>
        <Button
          label={t('guestPartnerSave')}
          fullWidth
          loading={saving}
          disabled={trimmed.length === 0}
          onPress={() => onSave(trimmed)}
          testID="guest-partner-save"
        />
        <Button label={t('cancel')} variant="ghost" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[2], marginBottom: space[3] },
  form: { paddingHorizontal: space[2], gap: space[2], marginBottom: space[4] },
  buttons: { gap: space[2], paddingHorizontal: space[2], marginTop: space[2] },
});
