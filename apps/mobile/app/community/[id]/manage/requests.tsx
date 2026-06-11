import {
  useAcceptJoinRequest,
  useCommunityRequests,
  useDeclineJoinRequest,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';

type JoinRequest = {
  id: string;
  community_id: string;
  user_id: string;
  status: string;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export default function ManageRequestsScreen() {
  const { t } = useT('community');
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: requests, isLoading } = useCommunityRequests(id);
  const accept = useAcceptJoinRequest(id);
  const decline = useDeclineJoinRequest(id);

  const busy = accept.isPending || decline.isPending;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    Alert.alert(t('errorTitle'), t(code, { defaultValue: t('unknown_error') }));
  };

  const onAccept = async (requestId: string) => {
    try {
      await accept.mutateAsync(requestId);
    } catch (e) {
      err(e);
    }
  };

  const onDecline = async (requestId: string) => {
    try {
      await decline.mutateAsync(requestId);
    } catch (e) {
      err(e);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={(requests ?? []) as JoinRequest[]}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{t('noRequests')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const name = item.profiles?.full_name ?? '—';
          const url = avatarUrl(item.profiles?.avatar_url);
          return (
            <View style={styles.row}>
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
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.decline]}
                  onPress={() => onDecline(item.id)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.declineText}>{t('decline')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.accept]}
                  onPress={() => onAccept(item.id)}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.acceptText}>{t('accept')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: '#3A4A60' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E6EAF0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, color: '#0B1F3A', fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  accept: { backgroundColor: '#0B7BFF' },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  decline: { backgroundColor: '#EEF2F7' },
  declineText: { color: '#3A4A60', fontWeight: '700', fontSize: 14 },
});
