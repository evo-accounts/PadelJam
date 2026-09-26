import { useGroupMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import type { EventInvitee } from './draft';
import { colors, palette } from '../../../theme';
import { Avatar, Button, Segmented } from '../../../components/ui';

export function InvitePicker({
  groupId,
  isPrivate,
  specification,
  invitees,
  onChange,
}: {
  groupId: string | null;
  isPrivate: boolean;
  /** A mixed event's guest needs a gender (0113, guest_gender_required). */
  specification?: string;
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
      <ManualInvitees invitees={invitees} onChange={onChange} mixed={specification === 'mixed'} />
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
            const name = member.profiles?.full_name ?? 'Player';
            return (
              <Pressable
                key={member.user_id}
                style={[styles.memberCard, selected && styles.memberCardSelected]}
                onPress={() => toggle(member.user_id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Avatar
                  uri={avatarUrl(member.profiles?.avatar_url)}
                  name={name}
                  colourKey={member.user_id}
                  size="md"
                  decorative
                />
                <Text style={[styles.memberName, selected && styles.memberNameSelected]}>{name}</Text>
              </Pressable>
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
  mixed,
}: {
  invitees: EventInvitee[];
  onChange: (invitees: EventInvitee[]) => void;
  mixed: boolean;
}) {
  const { t } = useT('event');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');

  const manual = invitees.filter((i) => i.invitee_id == null);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed || (mixed && !gender)) return;
    // 0113: a manual entry is a guest (name, and gender on a mixed event), confirmed for this event only.
    onChange([...invitees, { name: trimmed, ...(mixed && gender ? { gender } : {}) }]);
    setName('');
    setGender('');
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
      {mixed ? (
        <View style={styles.genderRow}>
          <Text style={styles.hint}>{t('manualGenderLabel')}</Text>
          <Segmented<'male' | 'female' | ''>
            options={[
              { value: 'male', label: t('genderMale') },
              { value: 'female', label: t('genderFemale') },
            ]}
            value={gender}
            onChange={setGender}
          />
        </View>
      ) : null}
      <Button
        label={t('addManual')}
        variant="outline"
        fullWidth
        disabled={name.trim().length === 0 || (mixed && !gender)}
        onPress={add}
      />

      {manual.length > 0 ? (
        <View style={styles.chips}>
          {manual.map((inv, index) => (
            <Pressable
              key={`${inv.name ?? ''}-${index}`}
              onPress={() => remove(inv)}
              accessibilityRole="button"
              accessibilityLabel={`${t('removeCta')}: ${inv.name ?? ''}`}
              style={styles.chip}
            >
              <Avatar name={inv.name} size="xs" decorative />
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
  genderRow: { gap: 6 },
  list: { gap: 10 },
  loading: { paddingVertical: 24, alignItems: 'center' },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.card,
  },
  memberCardSelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  memberName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
  memberNameSelected: { color: colors.primary },
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
