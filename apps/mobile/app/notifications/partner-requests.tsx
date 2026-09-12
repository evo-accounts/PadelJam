import {
  useIncomingPartnerRequests,
  useRespondToRequest,
  type IncomingPartnerRequest,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function PartnerRequestsScreen() {
  const { t } = useT('notifications');
  const router = useRouter();
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const rows = list.data ?? [];

  const act = (item: IncomingPartnerRequest, action: 'accept' | 'decline') =>
    respond.mutate(
      { kind: item.kind, requestId: item.request_id, action },
      { onError: () => Alert.alert(t('respondError')) },
    );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('partnerRequests')} onBack={() => router.back()} />
      {list.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
      ) : list.isError ? (
        <Text style={styles.empty}>{t('requestsError')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('requestsEmpty')}</Text>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.request_id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image
                source={item.requester_avatar ? { uri: item.requester_avatar } : undefined}
                style={styles.avatar}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.requester_name ?? '—'}</Text>
                <Text style={styles.context}>
                  {item.kind === 'community'
                    ? t('joinRequestLabel', { entity: item.entity_name })
                    : t('partnerRequestLabel', { entity: item.entity_name })}
                </Text>
              </View>
              <Pressable
                style={styles.decline}
                onPress={() => act(item, 'decline')}
                disabled={respond.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.declineText}>{t('decline')}</Text>
              </Pressable>
              <Pressable
                style={styles.accept}
                onPress={() => act(item, 'accept')}
                disabled={respond.isPending}
                accessibilityRole="button"
              >
                <Text style={styles.acceptText}>{t('accept')}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, marginHorizontal: 12, marginTop: 8, borderRadius: 12, padding: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.muted },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  context: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  decline: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.accent },
  declineText: { color: colors.foreground, fontWeight: '600', fontSize: 13 },
  accept: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary },
  acceptText: { color: colors.card, fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.mutedForeground, fontSize: 15 },
});
