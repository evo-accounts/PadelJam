/**
 * A group invitation (UX-GRP-02), opened from its notification. For a PRIVATE group this is the
 * only way in: the group itself stays invisible until you accept, so the screen reads
 * group_invitation_preview (0110) — identity and context, never events or ranking:
 *
 *   header        back, thumbnail, name, description
 *   Private Group label and the line explaining who can see it (private only)
 *   avatars and player count, the parent community as a card, the creation date
 *   bottom        who invited you, above "Decline" (secondary) and "Accept" (primary)
 *
 * No invitation (already answered, never sent) sends a PUBLIC group's visitor to the group page,
 * which is its own preview with "Join Group" at the bottom; a private group shows no access.
 * Accepting also brings you into the community, so a community with rules asks for them here
 * first (UX-COMM-05), the same gate as its own join screen.
 */
import {
  useAcceptGroupInvitation,
  useCommunities,
  useCommunity,
  useDeclineGroupInvitation,
  useGroup,
  useGroupInvitationPreview,
  useGroupMemberList,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AckGate } from '@/components/community/AckGate';
import { GroupIdentity } from '@/components/group/GroupIdentity';
import { avatarUrl, thumbnailUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, radius, space } from '../../../theme';
import { Avatar, AvatarStack, Badge, Button, Loading, Text, TopBar, useBanner } from '../../../components/ui';

export default function GroupInvitationScreen() {
  const { t, i18n } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const banner = useBanner();
  const uid = useSession().session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: preview, isLoading } = useGroupInvitationPreview(id);
  const { data: group, isLoading: loadingGroup } = useGroup(id);
  const { data: people } = useGroupMemberList(group ? id : null);
  const { data: community } = useCommunity(preview?.community_id);
  const { data: memberships } = useCommunities();
  const accept = useAcceptGroupInvitation();
  const decline = useDeclineGroupInvitation();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || loadingGroup) return <Loading />;

  const isMember = (people ?? []).some((p) => p.user_id === uid && p.is_member);
  if (isMember) return <Redirect href={`/group/${id}` as Href} />;
  if (!preview) {
    // No invitation to answer. A public group you can see is its own preview.
    if (group && !group.is_private) return <Redirect href={`/group/${id}` as Href} />;
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <Text variant="sectionTitle">{t('noAccessTitle')}</Text>
        <Text variant="body" tone="muted" style={styles.centerText}>
          {t('noAccessBody')}
        </Text>
        <Button label={t('back')} variant="secondary" onPress={goBack} />
      </SafeAreaView>
    );
  }

  // Entering the community for the first time with rules to accept (UX-COMM-05).
  const inCommunity = (memberships ?? []).some((m) => m.community?.id === preview.community_id);
  const rulesText = community?.cancellation_rules_enabled ? (community.cancellation_rules_text ?? '') : '';
  const needsAck = !inCommunity && rulesText.length > 0;

  const onAccept = async () => {
    setError(null);
    try {
      await accept.mutateAsync({ groupId: id, communityId: preview.community_id, ack });
      banner.show(t('joinedToast', { name: preview.name }), 'success');
      router.replace(`/group/${id}` as Href);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  const onDecline = async () => {
    setError(null);
    try {
      await decline.mutateAsync(id);
      banner.show(t('declinedToast'), 'success');
      goBack();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  const communityThumb = thumbnailUrl(preview.community_thumb);
  const created = new Date(preview.created_at).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        centre={<GroupIdentity name={preview.name} description={preview.description} thumbnailPath={preview.thumbnail_path} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {preview.is_private ? (
          <View style={styles.privateBlock}>
            <Badge label={t('privateGroupLabel')} />
            <Text variant="caption" tone="muted">
              {t('privateGroupExplain')}
            </Text>
          </View>
        ) : null}

        <AvatarStack
          people={preview.members.map((m) => ({ id: m.id, name: m.full_name, uri: avatarUrl(m.avatar_url) }))}
          countLabel={t('playersCount', { count: preview.member_count })}
        />

        <View style={styles.communityCard}>
          {communityThumb ? (
            <Image source={{ uri: communityThumb }} style={styles.communityThumb} contentFit="cover" />
          ) : (
            <Avatar name={preview.community_name} colourKey={preview.community_id} size="md" decorative />
          )}
          <Text variant="label" style={styles.flex} numberOfLines={1}>
            {preview.community_name}
          </Text>
        </View>
        <Text variant="caption" tone="muted">
          {t('createdOn', { date: created })}
        </Text>

        {needsAck ? <AckGate value={ack} onChange={setAck} rulesText={rulesText} /> : null}
        {error ? (
          <Text variant="label" tone="destructive" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {preview.inviter_name ? (
          <View style={styles.inviter}>
            <Avatar
              uri={avatarUrl(preview.inviter_avatar)}
              name={preview.inviter_name}
              colourKey={preview.inviter_id}
              size="sm"
              decorative
            />
            <Text variant="label" numberOfLines={2} style={styles.flex}>
              {t('invitedBy', { name: preview.inviter_name })}
            </Text>
          </View>
        ) : null}
        <View style={styles.pair}>
          <Button
            label={t('declineCta')}
            variant="secondary"
            style={styles.flex}
            loading={decline.isPending}
            disabled={accept.isPending}
            onPress={onDecline}
            testID="group-invite-decline"
          />
          <Button
            label={t('acceptCta')}
            style={styles.flex}
            loading={accept.isPending}
            disabled={decline.isPending || (needsAck && !ack)}
            onPress={onAccept}
            testID="group-invite-accept"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6] },
  centerText: { textAlign: 'center' },
  content: { padding: space[4], gap: space[4] },
  privateBlock: { gap: space[2], alignItems: 'flex-start' },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space[3],
  },
  communityThumb: { width: 40, height: 40, borderRadius: radius.full },
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[2],
    gap: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inviter: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pair: { flexDirection: 'row', gap: space[3] },
});
