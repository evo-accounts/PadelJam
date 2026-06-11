import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';

export type PostComment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Renders the list of comments on a post (author + body + time). */
export function CommentList({ comments }: { comments: PostComment[] }) {
  const { t } = useT('community');

  if (comments.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('noComments')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {comments.map((c) => {
        const name = c.author?.full_name ?? '—';
        const avatar = avatarUrl(c.author?.avatar_url);
        return (
          <View key={c.id} style={styles.row}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" transition={120} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.bubble}>
              <View style={styles.metaRow}>
                <Text style={styles.author} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.time}>{formatTime(c.created_at)}</Text>
              </View>
              <Text style={styles.body}>{c.body}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14, paddingVertical: 8 },
  empty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#8896A8' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E6EAF0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1F3A' },
  avatarInitial: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bubble: { flex: 1, backgroundColor: '#F2F5F9', borderRadius: 12, padding: 10, gap: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0B1F3A' },
  time: { fontSize: 12, color: '#8896A8' },
  body: { fontSize: 15, color: '#222', lineHeight: 20 },
});
