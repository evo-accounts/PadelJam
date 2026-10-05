import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { colors, space } from '../theme';

const FAB_SIZE = 56;

/** Bottom padding a scroller under the button needs so its last row can scroll clear of it. */
export const FAB_CLEARANCE = FAB_SIZE + space[5] + space[5];

/**
 * The Create event button floating over Home and Events (UX-HOME-01, D11). Not on Explore any
 * more: there it covered the community cards' actions, and creating is a Home action.
 *
 * B6: the offset used to be `insets.bottom + 24`. The tab bar is not absolutely positioned, so
 * a tab screen already ends at the tab bar's top edge and the home-indicator inset lives INSIDE
 * the tab bar — adding it again floated the button ~58pt above the bar on a notched phone.
 * The audit asks for about 20.
 */
export function CreateEventFab() {
  const { t } = useT('home');
  const router = useRouter();
  return (
    <Pressable
      style={styles.fab}
      onPress={() => router.push('/event/create')}
      accessibilityRole="button"
      accessibilityLabel={t('createEventFab')}
      testID="create-event-fab"
    >
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={colors.card} size={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space[5],
    bottom: space[5],
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.foreground,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
