import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';

import { SuggestedCommunityCard, type SuggestedCommunity } from './SuggestedCommunityCard';
import { colors } from '../../theme';
import { EmptyState as EmptyStatePrimitive, emptyIcon, Text } from '../ui';

type Props = {
  suggested: SuggestedCommunity[];
  canCreate: boolean;
  onPressSuggested: (id: string) => void;
  onCreate: () => void;
};

/**
 * The community tab's empty state. Composes the generic `EmptyState`
 * primitive for the "nothing here yet" card (UX-GLOB-03 Task 4) and keeps
 * its own suggested-communities rail below it — that part is specific to
 * this screen and has no equivalent in the primitive.
 */
export function EmptyState({ suggested, canCreate, onPressSuggested, onCreate }: Props) {
  const { t } = useT('community');

  return (
    <View style={styles.container}>
      <EmptyStatePrimitive
        icon={emptyIcon('person.3')}
        title={t('emptyTitle')}
        body={t('emptySubtitle')}
        action={canCreate ? { label: t('createCardCta'), onPress: onCreate } : undefined}
        testID="empty-community"
      />

      {suggested.length > 0 ? (
        <View style={styles.section}>
          <Text variant="sectionTitle" style={styles.sectionTitle}>{t('suggestedTitle')}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  section: { marginBottom: 28 },
  sectionTitle: { color: colors.foreground, marginBottom: 12 },
  rail: { height: 130 },
});
