/**
 * Players of an event — the destination of the Players card's chevron (UX-JEVT-02).
 *
 * MINIMAL on purpose: confirmed players (then stand-by) from the data the event page already
 * loads. M4b rebuilds this as the read-only Player list of UX-JEVT-08 — tabs (Confirmed / Invited /
 * Waiting list) through `event_invited_players` (migration 0112) and the guest tag.
 */
import { useEventParticipants } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import { Avatar, EmptyState, emptyIcon, ListRow, Text, TopBar } from '../../../components/ui';

export default function EventPlayersScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useEventParticipants(id);
  const confirmed = (data ?? []).filter((p) => p.status === 'confirmed');
  const sections = [
    { key: 'confirmed', title: t('playersListConfirmed'), rows: confirmed.filter((p) => !p.is_standby) },
    { key: 'standby', title: t('playersListStandby'), rows: confirmed.filter((p) => p.is_standby) },
  ].filter((s) => s.rows.length > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('playersListTitle')} />
      {sections.length === 0 ? (
        <EmptyState fill icon={emptyIcon('person.2')} title={t('playersListEmpty')} testID="event-players-empty" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {sections.map((s) => (
            <View key={s.key} style={styles.section}>
              <Text variant="label" tone="muted" style={styles.sectionTitle}>
                {s.title}
              </Text>
              {s.rows.map((p) => {
                const name = p.profiles?.full_name ?? p.guest_name ?? '—';
                const profileId = p.profiles?.id ?? null;
                return (
                  <ListRow
                    key={p.id}
                    title={name}
                    leading={<Avatar uri={avatarUrl(p.profiles?.avatar_url)} name={name} colourKey={profileId ?? p.id} size="md" decorative />}
                    onPress={profileId ? () => router.push(`/profile/${profileId}` as Href) : undefined}
                    trailing={
                      profileId ? (
                        <Text variant="body" tone="muted">
                          ›
                        </Text>
                      ) : undefined
                    }
                    testID={`event-player-${p.id}`}
                  />
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: space[8] },
  section: { paddingHorizontal: space[4], paddingTop: space[4] },
  sectionTitle: { marginBottom: space[2] },
});
