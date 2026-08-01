import { useCommunity, useCommunityMembers } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { coverUrl, thumbnailUrl } from '@/lib/community-images';
import { colors } from '../../theme';

const PRIVACY_KEY: Record<string, string> = {
  public: 'privacyPublicTitle',
  request_to_join: 'privacyRequestTitle',
  private: 'privacyPrivateTitle',
};

const TYPE_KEY: Record<string, string> = {
  club: 'typeClub',
  team: 'typeTeam',
  friends: 'typeFriends',
};

/**
 * Persistent community hero: cover image, centered thumbnail, name and a row of
 * Type · Members · Privacy pills. Reads the community + member count itself so it
 * can be dropped above any tab layout.
 */
export function CommunityHero({ communityId }: { communityId: string }) {
  const { t } = useT('community');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const { data: community } = useCommunity(communityId);
  const { data: members } = useCommunityMembers(communityId);

  if (!community) {
    return <View style={styles.coverPlaceholder} />;
  }

  const cover = coverUrl(community.cover_image_path);
  const thumb = thumbnailUrl(community.thumbnail_path);
  const typeLabel = t(TYPE_KEY[community.type] ?? 'typeClub');
  const privacyLabel = t(PRIVACY_KEY[community.privacy] ?? 'privacyPublicTitle');
  const memberCount = members?.length ?? 0;
  const myRole = members?.find((m) => m.user_id === uid)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  return (
    <View style={styles.container}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]} />
      )}
      {canManage ? (
        <Pressable
          style={styles.manageButton}
          accessibilityRole="button"
          accessibilityLabel={t('manageTitle')}
          onPress={() => router.push(`/community/${communityId}/manage`)}
          hitSlop={8}
        >
          <Text style={styles.manageIcon}>⚙</Text>
        </Pressable>
      ) : null}
      <View style={styles.thumbWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={styles.thumbInitial}>{community.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {community.name}
      </Text>
      <View style={styles.pills}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{typeLabel}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {t('membersPill', { count: memberCount })}
          </Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{privacyLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.card, paddingBottom: 12 },
  cover: { width: '100%', height: 120, backgroundColor: colors.muted },
  manageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,31,58,0.55)',
  },
  manageIcon: { color: colors.card, fontSize: 18, lineHeight: 20 },
  coverFallback: { backgroundColor: colors.primary },
  coverPlaceholder: { width: '100%', height: 120, backgroundColor: colors.muted },
  thumbWrap: {
    alignSelf: 'center',
    marginTop: -36,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.card,
    overflow: 'hidden',
  },
  thumb: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.muted },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  thumbInitial: { color: colors.card, fontSize: 28, fontWeight: '700' },
  name: { marginTop: 8, fontSize: 22, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  pills: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground },
});
