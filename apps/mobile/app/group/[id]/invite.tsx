import {
  useCommunity,
  useCommunityMembers,
  useGroup,
  useGroupMembers,
  useInviteToGroup,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../../theme';

type Candidate = {
  user_id: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

const KNOWN_ERROR_KEYS = new Set([
  'forbidden',
  'group_not_found',
  'not_a_member',
  'invitation_not_found',
]);

export default function GroupInviteScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: group } = useGroup(id);
  // Undefined until useGroup resolves; the hooks stay disabled until then.
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId);
  const { data: communityMembers } = useCommunityMembers(communityId);
  const { data: groupMembers } = useGroupMembers(id);
  const invite = useInviteToGroup(id);

  const [query, setQuery] = useState('');
  const [invited, setInvited] = useState<Record<string, true>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const groupIds = new Set((groupMembers ?? []).map((m) => m.user_id));
    const q = query.trim().toLowerCase();
    return (communityMembers ?? [])
      .filter((m) => !groupIds.has(m.user_id))
      .filter((m) =>
        q.length === 0 ? true : (m.profiles?.full_name ?? '').toLowerCase().includes(q),
      ) as Candidate[];
  }, [communityMembers, groupMembers, query]);

  const doInvite = (person: Candidate) => {
    Alert.alert(
      t('inviteTitle'),
      t('inviteConfirm', { community: community?.name ?? '' }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setPendingId(person.user_id);
            try {
              await invite.mutateAsync(person.user_id);
              setInvited((s) => ({ ...s, [person.user_id]: true }));
              Alert.alert(t('inviteSentTitle'), t('inviteSentToast'));
            } catch (e) {
              const code = e instanceof Error ? e.message : 'unknown_error';
              Alert.alert(t('errorTitle'), t(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error'));
            } finally {
              setPendingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t('inviteTitle')}</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('inviteSearchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={candidates}
        keyExtractor={(p) => p.user_id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{t('inviteEmpty')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = item.profiles?.full_name ?? '—';
          const url = avatarUrl(item.profiles?.avatar_url);
          const isInvited = !!invited[item.user_id];
          const isPending = pendingId === item.user_id;
          return (
            <Pressable
              style={styles.personRow}
              onPress={() => doInvite(item)}
              disabled={isInvited || isPending}
              accessibilityRole="button"
            >
              {url ? (
                <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" transition={120} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {isPending ? (
                <ActivityIndicator color={colors.primary} />
              ) : isInvited ? (
                <Text style={styles.invitedMark}>✓</Text>
              ) : (
                <Text style={styles.inviteAction}>{t('inviteMembersCta')}</Text>
              )}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { fontSize: 32, color: colors.foreground, lineHeight: 32 },
  backSpacer: { width: 24 },
  title: { fontSize: 17, fontWeight: '700', color: colors.foreground },
  searchWrap: { padding: 16 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarInitial: { color: colors.card, fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, color: colors.foreground, fontWeight: '500' },
  inviteAction: { fontSize: 14, fontWeight: '700', color: colors.primary },
  invitedMark: { fontSize: 18, fontWeight: '700', color: colors.success },
});
