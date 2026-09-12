import { useAcceptGroupInvitation, useGroup, useJoinGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupHeader } from '@/components/group/GroupHeader';
import { colors, palette } from '../../../theme';
import { Button, TopBar } from '../../../components/ui';

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

  const { data: group, isLoading, isError } = useGroup(id);
  const join = useJoinGroup();
  const accept = useAcceptGroupInvitation();

  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noAccess, setNoAccess] = useState(false);

  const noAccessView = (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.noAccess}>
        <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
        <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
        <Button label={t('cancel')} variant="outline" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // useGroup uses .single(), which errors when RLS hides the row — i.e. a private group the user
  // can't read. The only way to view it is via an invitation, so show the no-access state rather
  // than spinning forever.
  if (isError || !group) {
    return noAccessView;
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
    return noAccessView;
  }

  const isPrivate = group.is_private;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={() => router.back()} backLabel={t('back')} />
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
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.ctaText}>{isPrivate ? t('acceptCta') : t('joinCta')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 16 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  error: { fontSize: 14, color: colors.destructive, textAlign: 'center', fontWeight: '600' },
  cta: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  ctaDisabled: { backgroundColor: palette.purple[200] },
  ctaText: { color: colors.card, fontSize: 17, fontWeight: '700' },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  noAccessTitle: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  noAccessBody: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center', lineHeight: 21 },
});
