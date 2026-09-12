import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SuggestedCommunityCard, type SuggestedCommunity } from './SuggestedCommunityCard';
import { colors } from '../../theme';

type Props = {
  suggested: SuggestedCommunity[];
  canCreate: boolean;
  onPressSuggested: (id: string) => void;
  onCreate: () => void;
};

export function EmptyState({ suggested, canCreate, onPressSuggested, onCreate }: Props) {
  const { t } = useT('community');

  return (
    <View style={styles.container}>
      <Text style={styles.emptyTitle}>{t('emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>{t('emptySubtitle')}</Text>

      {suggested.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('suggestedTitle')}</Text>
          <View style={styles.rail}>
            <FlashList
              horizontal
              data={suggested}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <SuggestedCommunityCard
                  community={item}
                  onPress={() => onPressSuggested(item.id)}
                />
              )}
            />
          </View>
        </View>
      ) : null}

      {canCreate ? (
        <View style={styles.createCard}>
          <Text style={styles.createCardTitle}>{t('createCardTitle')}</Text>
          <Text style={styles.createCardBody}>{t('createCardBody')}</Text>
          <Pressable style={styles.cta} onPress={onCreate} accessibilityRole="button">
            <Text style={styles.ctaText}>{t('createCardCta')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.foreground, marginBottom: 6 },
  emptySubtitle: { fontSize: 15, color: colors.mutedForeground, marginBottom: 24 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground, marginBottom: 12 },
  rail: { height: 130 },
  createCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    backgroundColor: colors.background,
  },
  createCardTitle: { fontSize: 18, fontWeight: '700', color: colors.foreground, marginBottom: 6 },
  createCardBody: { fontSize: 15, color: colors.mutedForeground, marginBottom: 16 },
  cta: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: colors.card, fontSize: 16, fontWeight: '600' },
});
