import { useGroupMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EventInvitee } from './draft';
import { SelectableCard } from './SelectableCard';
import { colors, palette } from '../../../theme';

export function InvitePicker({
  groupId,
  isPrivate,
  invitees,
  onChange,
}: {
  groupId: string | null;
  isPrivate: boolean;
  invitees: EventInvitee[];
  onChange: (invitees: EventInvitee[]) => void;
}) {
  const { t } = useT('event');

  // Public group event: the RPC auto-invites all group members. No picker.
  if (!isPrivate && groupId) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{t('inviteFromGroup')}</Text>
        <Text style={styles.hint}>{t('inviteSubtitle')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groupId ? (
        <GroupMemberList groupId={groupId} invitees={invitees} onChange={onChange} />
      ) : null}
      <ManualInvitees invitees={invitees} onChange={onChange} />
    </View>
  );
}

function GroupMemberList({
  groupId,
  invitees,
  onChange,
}: {
  groupId: string;
  invitees: EventInvitee[];
  onChange: (invitees: EventInvitee[]) => void;
}) {
  const { t } = useT('event');
  const members = useGroupMembers(groupId);

  const toggle = (userId: string) => {
    const exists = invitees.some((i) => i.invitee_id === userId);
    if (exists) {
      onChange(invitees.filter((i) => i.invitee_id !== userId));
    } else {
      onChange([...invitees, { invitee_id: userId }]);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('inviteFromGroup')}</Text>
      {members.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.list}>
          {(members.data ?? []).map((member) => {
            const selected = invitees.some((i) => i.invitee_id === member.user_id);
            return (
              <SelectableCard
                key={member.user_id}
                title={member.profiles?.full_name ?? 'Player'}
                selected={selected}
                onPress={() => toggle(member.user_id)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

function ManualInvitees({
  invitees,
  onChange,
}: {
  invitees: EventInvitee[];
  onChange: (invitees: EventInvitee[]) => void;
}) {
  const { t } = useT('event');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const manual = invitees.filter((i) => i.invitee_id == null);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([
      ...invitees,
      {
        name: trimmed,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      },
    ]);
    setName('');
    setEmail('');
    setPhone('');
  };

  const remove = (target: EventInvitee) => {
    onChange(invitees.filter((i) => i !== target));
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('addManual')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('manualNameLabel')}
        placeholderTextColor={palette.slate[400]}
        accessibilityLabel={t('manualNameLabel')}
      />
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={t('manualEmailLabel')}
        placeholderTextColor={palette.slate[400]}
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel={t('manualEmailLabel')}
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder={t('manualPhoneLabel')}
        placeholderTextColor={palette.slate[400]}
        keyboardType="phone-pad"
        accessibilityLabel={t('manualPhoneLabel')}
      />
      <Pressable
        onPress={add}
        disabled={name.trim().length === 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: name.trim().length === 0 }}
        style={[styles.addButton, name.trim().length === 0 && styles.addButtonDisabled]}
      >
        <Text style={styles.addButtonLabel}>{t('addManual')}</Text>
      </Pressable>

      {manual.length > 0 ? (
        <View style={styles.chips}>
          {manual.map((inv, index) => (
            <Pressable
              key={`${inv.name ?? ''}-${inv.email ?? ''}-${inv.phone ?? ''}-${index}`}
              onPress={() => remove(inv)}
              accessibilityRole="button"
              style={styles.chip}
            >
              <Text style={styles.chipText}>{inv.name ?? '—'}</Text>
              <Text style={styles.chipRemove}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  hint: { fontSize: 14, color: colors.mutedForeground },
  list: { gap: 10 },
  loading: { paddingVertical: 24, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  addButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonLabel: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.purple[100],
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  chipRemove: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
