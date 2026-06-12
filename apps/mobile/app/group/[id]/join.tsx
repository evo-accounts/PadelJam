import { useAcceptGroupInvitation, useGroup, useJoinGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '@/components/group/GroupHeader';

const KNOWN_ERROR_KEYS = new Set([
  'forbidden',
  'group_private_join_forbidden',
  'invitation_not_found',
  'group_not_found',
]);

export default function GroupJoinModal() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: group, isLoading } = useGroup(id);
  const join = useJoinGroup();
  const accept = useAcceptGroupInvitation();

  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);

  if (isLoading || !group) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  const pending = join.isPending || accept.isPending;

  const onJoin = () => {
    setErrorKey(null);
    void (async () => {
      try {
        await join.mutateAsync({ groupId: id, communityId: group.community_id });
        router.replace(`/group/${id}` as Href);
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setErrorKey(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error');
      }
    })();
  };

  const onAccept = () => {
    setErrorKey(null);
    void (async () => {
      try {
        await accept.mutateAsync({ groupId: id, communityId: group.community_id });
        router.replace(`/group/${id}` as Href);
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        // No pending invitation for this private group → render the no-access state.
        if (code === 'invitation_not_found' || code === 'group_private_join_forbidden') {
          setNoAccess(true);
          return;
        }
        setErrorKey(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error');
      }
    })();
  };

  if (noAccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.noAccess}>
          <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
          <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
          <Pressable style={styles.secondary} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isPrivate = group.is_private;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GroupHeader
        name={group.name}
        description={group.description}
        thumbnailPath={group.thumbnail_path}
        memberCount={0}
        isPrivate={isPrivate}
      />
      <View style={styles.body}>
        <Text style={styles.heading}>
          {isPrivate ? t('invitedTitle', { name: group.name }) : t('joinTitle')}
        </Text>

        {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}

        <Pressable
          style={[styles.cta, pending && styles.ctaDisabled]}
          disabled={pending}
          onPress={isPrivate ? onAccept : onJoin}
          accessibilityRole="button"
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{isPrivate ? t('acceptCta') : t('joinCta')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 16 },
  heading: { fontSize: 20, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  error: { fontSize: 14, color: '#C0392B', textAlign: 'center', fontWeight: '600' },
  cta: { backgroundColor: '#0B7BFF', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  ctaDisabled: { backgroundColor: '#A9C7EE' },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  noAccessTitle: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  noAccessBody: { fontSize: 15, color: '#3A4A60', textAlign: 'center', lineHeight: 21 },
  secondary: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 24 },
  secondaryText: { fontSize: 16, fontWeight: '600', color: '#0B7BFF' },
});
