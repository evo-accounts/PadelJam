import {
  useCommunity,
  useCommunityMembers,
  useCommunityReviews,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RulesModal } from '@/components/community/RulesModal';

const TYPE_KEY: Record<string, string> = {
  club: 'typeClub',
  team: 'typeTeam',
  friends: 'typeFriends',
};

const PRIVACY_TITLE_KEY: Record<string, string> = {
  public: 'privacyPublicTitle',
  request_to_join: 'privacyRequestTitle',
  private: 'privacyPrivateTitle',
};

const PRIVACY_SUMMARY_KEY: Record<string, string> = {
  public: 'privacySummaryPublic',
  request_to_join: 'privacySummaryRequest',
  private: 'privacySummaryPrivate',
};

const ROLE_LABEL_KEY: Record<string, string> = {
  owner: 'aboutOwnerRole',
  admin: 'aboutAdminRole',
};

export default function CommunityAboutScreen() {
  const { t, i18n } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [showRules, setShowRules] = useState(false);

  const { data: community } = useCommunity(id);
  const { data: members } = useCommunityMembers(id);
  const { data: reviews } = useCommunityReviews(id);

  if (!community) return <View style={styles.container} />;

  const typeLabel = t(TYPE_KEY[community.type] ?? 'typeClub');
  const privacyLabel = t(PRIVACY_TITLE_KEY[community.privacy] ?? 'privacyPublicTitle');
  const privacySummary = t(PRIVACY_SUMMARY_KEY[community.privacy] ?? 'privacySummaryPublic');
  const memberCount = members?.length ?? 0;
  const admins = (members ?? []).filter((m) => m.role === 'owner' || m.role === 'admin');

  const created = new Date(community.created_at).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hasReviews = reviews != null && reviews.count > 0 && reviews.average != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {community.description ? <Text style={styles.description}>{community.description}</Text> : null}

      <View style={styles.row}>
        <Text style={styles.label}>{t('aboutTypeLabel')}</Text>
        <Text style={styles.value}>{typeLabel}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('aboutMembersLabel')}</Text>
        <Text style={styles.value}>{t('membersPill', { count: memberCount })}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('aboutPrivacyLabel')}</Text>
        <Text style={styles.value}>{privacyLabel}</Text>
      </View>
      <Text style={styles.summary}>{privacySummary}</Text>

      {community.location ? (
        <View style={styles.row}>
          <Text style={styles.label}>{t('aboutLocationLabel')}</Text>
          <Text style={styles.value}>{community.location}</Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.label}>{t('aboutCreatedLabel')}</Text>
        <Text style={styles.value}>{created}</Text>
      </View>

      {admins.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('aboutAdminsLabel')}</Text>
          {admins.map((a) => (
            <View key={a.user_id} style={styles.adminRow}>
              <Text style={styles.adminName} numberOfLines={1}>
                {a.profiles?.full_name ?? '—'}
              </Text>
              <Text style={styles.adminRole}>{t(ROLE_LABEL_KEY[a.role] ?? 'aboutAdminRole')}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {community.cancellation_rules_enabled && community.cancellation_rules_text ? (
        <Pressable onPress={() => setShowRules(true)} accessibilityRole="button" style={styles.section}>
          <Text style={styles.link}>{t('cancellationRulesLink')}</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.reviews}
        accessibilityRole="button"
        onPress={() => router.push(`/community/${id}/reviews`)}
      >
        <Text style={styles.reviewsText}>
          {hasReviews
            ? t('reviewsSummary', {
                average: reviews!.average!.toFixed(1),
                count: reviews!.count,
              })
            : t('noReviews')}
        </Text>
      </Pressable>

      {community.cancellation_rules_text ? (
        <RulesModal
          visible={showRules}
          text={community.cancellation_rules_text}
          onClose={() => setShowRules(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 4 },
  description: { fontSize: 15, color: '#222', lineHeight: 22, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 14, color: '#8A95A5', fontWeight: '600' },
  value: { fontSize: 14, color: '#0B1F3A', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  summary: { fontSize: 13, color: '#3A4A60', lineHeight: 19, marginTop: 2, marginBottom: 4 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 13, color: '#8A95A5', fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  adminRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  adminName: { fontSize: 15, color: '#0B1F3A', fontWeight: '600', flexShrink: 1 },
  adminRole: { fontSize: 13, color: '#3A4A60', fontWeight: '600' },
  link: { fontSize: 15, fontWeight: '700', color: '#0B7BFF' },
  reviews: { marginTop: 20, paddingVertical: 8 },
  reviewsText: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
});
