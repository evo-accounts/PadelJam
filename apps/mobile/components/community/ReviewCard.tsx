import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';

import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../theme';
import { Avatar, Rating } from '../ui';

export type ReviewRow = {
  id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

type ReviewCardProps = {
  review: ReviewRow;
};

/** Single review card: avatar, name, stars, optional body, relative time. */
export function ReviewCard({ review }: ReviewCardProps) {
  const name = review.profiles?.full_name ?? '—';

  const relativeTime = formatRelativeTime(review.created_at);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar
          uri={avatarUrl(review.profiles?.avatar_url)}
          name={name}
          colourKey={review.user_id}
          size="md"
          decorative
        />
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.starsRow}>
            <Rating value={review.rating} size="sm" />
            <Text style={styles.time}>{relativeTime}</Text>
          </View>
        </View>
      </View>
      {review.body ? <Text style={styles.body}>{review.body}</Text> : null}
    </View>
  );
}

function formatRelativeTime(dateString: string): string {
  try {
    const diff = Date.now() - new Date(dateString).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    return `${years}y`;
  } catch {
    return '';
  }
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 12, color: palette.slate[400] },
  body: { fontSize: 14, color: colors.mutedForeground, lineHeight: 20, marginTop: 8 },
});
