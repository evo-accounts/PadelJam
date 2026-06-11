import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { StarRating } from './StarRating';

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
  const url = avatarUrl(review.profiles?.avatar_url);
  const initial = (name.charAt(0) || '?').toUpperCase();

  const relativeTime = formatRelativeTime(review.created_at);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {url ? (
          <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" transition={120} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.starsRow}>
            <StarRating value={review.rating} size={16} />
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
    borderBottomColor: '#E6EAF0',
    backgroundColor: '#fff',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E6EAF0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 16, fontWeight: '700' },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 12, color: '#8A95A5' },
  body: { fontSize: 14, color: '#3A4A60', lineHeight: 20, marginTop: 8 },
});
