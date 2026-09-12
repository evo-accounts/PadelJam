import { useCommunity, useJoinCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AckGate } from '@/components/community/AckGate';
import { CommunityHero } from '@/components/community/CommunityHero';
import { colors } from '../../../theme';
import { Button, TopBar } from '../../../components/ui';

const PRIVACY_SUMMARY_KEY: Record<string, string> = {
  public: 'privacySummaryPublic',
  request_to_join: 'privacySummaryRequest',
  private: 'privacySummaryPrivate',
};

const KNOWN_ERROR_KEYS = new Set([
  'community_full',
  'invite_required',
  'rules_acknowledgement_required',
]);

export default function CommunityJoinModal() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: community, isLoading } = useCommunity(id);
  const join = useJoinCommunity(id);

  const [ack, setAck] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  if (isLoading || !community) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const rulesGated =
    community.cancellation_rules_enabled && !!community.cancellation_rules_text;
  const ctaKey = community.privacy === 'request_to_join' ? 'requestCta' : 'joinCta';
  const ctaDisabled = (rulesGated && !ack) || join.isPending;
  const summary = t(PRIVACY_SUMMARY_KEY[community.privacy] ?? 'privacySummaryPublic');

  const onPress = () => {
    setErrorKey(null);
    void (async () => {
      try {
        const result = await join.mutateAsync(ack);
        if (result === 'joined') {
          Alert.alert(t('joinedToast'));
          // The bare `/community/[id]` group route resolves at runtime but isn't in
          // the typed-route table; target its first tab, which is the same landing.
          router.replace(`/community/${id}/posts`);
        } else {
          setRequested(true);
        }
      } catch (e) {
        const code = e instanceof Error ? e.message : 'unknown_error';
        setErrorKey(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error');
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={() => router.back()} backLabel={t('back')} />
      <CommunityHero communityId={id} />
      <View style={styles.body}>
        {requested ? (
          <View style={styles.requested}>
            <Text style={styles.requestedTitle}>{t('requestedTitle')}</Text>
            <Text style={styles.requestedBody}>{t('requestedBody')}</Text>
            <Button label={t('close')} variant="outline" onPress={() => router.back()} />
          </View>
        ) : (
          <>
            <Text style={styles.summary}>{summary}</Text>

            {rulesGated ? (
              <AckGate
                value={ack}
                onChange={setAck}
                rulesText={community.cancellation_rules_text ?? ''}
              />
            ) : null}

            {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}

            <Button
              label={t(ctaKey)}
              fullWidth
              loading={join.isPending}
              disabled={ctaDisabled}
              onPress={onPress}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 16 },
  summary: { fontSize: 15, color: colors.mutedForeground, lineHeight: 21, textAlign: 'center' },
  error: { fontSize: 14, color: colors.destructive, textAlign: 'center', fontWeight: '600' },
  requested: { alignItems: 'center', gap: 12, paddingTop: 12 },
  requestedTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground },
  requestedBody: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center', lineHeight: 21 },
});
