import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Community = {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  location: string | null;
};

export function CommunityCard({
  community,
  onOpen,
  onRequestJoin,
}: {
  community: Community;
  onOpen: () => void;
  onRequestJoin: () => void;
}) {
  const { t } = useT('discovery');
  const isRequest = community.privacy === 'request_to_join';
  return (
    <Pressable style={styles.card} onPress={onOpen} accessibilityRole="button">
      <View style={styles.thumb} />
      <Text style={styles.name} numberOfLines={1}>
        {community.name}
      </Text>
      {community.location ? (
        <Text style={styles.meta} numberOfLines={1}>
          {community.location}
        </Text>
      ) : null}
      {isRequest ? (
        <Pressable style={styles.cta} onPress={onRequestJoin} accessibilityRole="button">
          <Text style={styles.ctaText}>{t('requestToJoin')}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 180, backgroundColor: '#fff', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0', padding: 12, gap: 6 },
  thumb: { height: 80, borderRadius: 10, backgroundColor: '#F0F3F8' },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  meta: { fontSize: 13, color: '#6B7685' },
  cta: { marginTop: 4, borderRadius: 999, backgroundColor: '#E6F0FF', paddingVertical: 6, alignItems: 'center' },
  ctaText: { fontSize: 13, fontWeight: '700', color: '#0B7BFF' },
});
