import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';

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
  card: { width: 180, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 12, gap: 6 },
  thumb: { height: 80, borderRadius: 10, backgroundColor: colors.muted },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground },
  cta: { marginTop: 4, borderRadius: 999, backgroundColor: palette.purple[100], paddingVertical: 6, alignItems: 'center' },
  ctaText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
