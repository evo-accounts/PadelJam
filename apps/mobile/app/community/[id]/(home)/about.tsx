import {
  useCommunity,
  useCommunityMembers,
  useCommunityReviews,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { RulesModal } from '@/components/community/RulesModal';
import { avatarUrl } from '@/lib/community-images';
import { Avatar } from '@/components/ui';
import { colors, palette } from '../../../../theme';

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
  const id = useCommunityId();
  const [showRules, setShowRules] = useState(false);

  const { data: community, isError } = useCommunity(id);
  const { data: members, isError: membersError } = useCommunityMembers(id);
  const { data: reviews, isError: reviewsError } = useCommunityReviews(id);

  if (isError) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.error}>{t('loadError')}</Text>
      </View>
    );
  }

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
        <Text style={[styles.value, membersError && styles.error]}>
          {membersError ? t('loadError') : t('membersPill', { count: memberCount })}
        </Text>
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

      {membersError ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('aboutAdminsLabel')}</Text>
          <Text style={styles.error}>{t('loadError')}</Text>
        </View>
      ) : admins.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('aboutAdminsLabel')}</Text>
          {admins.map((a) => (
            <View key={a.user_id} style={styles.adminRow}>
              {/* Decorative: the admin's name is right beside it as its own Text node. */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Avatar
                  uri={avatarUrl(a.profiles?.avatar_url)}
                  name={a.profiles?.full_name}
                  colourKey={a.user_id}
                  size="md"
                  style={styles.adminAvatar}
                />
              </View>
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
        onPress={() => router.push(`/community/${id}/reviews` as Href)}
      >
        <Text style={[styles.reviewsText, reviewsError && styles.error]}>
          {reviewsError
            ? t('loadError')
            : hasReviews
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
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  error: { fontSize: 15, color: colors.destructive, fontWeight: '600', textAlign: 'center' },
  content: { padding: 16, gap: 4 },
  description: { fontSize: 15, color: colors.foreground, lineHeight: 22, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 14, color: palette.slate[400], fontWeight: '600' },
  value: { fontSize: 14, color: colors.foreground, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  summary: { fontSize: 13, color: colors.mutedForeground, lineHeight: 19, marginTop: 2, marginBottom: 4 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 13, color: palette.slate[400], fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  adminRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  adminAvatar: { marginRight: 2 },
  adminName: { fontSize: 15, color: colors.foreground, fontWeight: '600', flexShrink: 1, flexGrow: 1 },
  adminRole: { fontSize: 13, color: colors.mutedForeground, fontWeight: '600' },
  link: { fontSize: 15, fontWeight: '700', color: colors.primary },
  reviews: { marginTop: 20, paddingVertical: 8 },
  reviewsText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
});
