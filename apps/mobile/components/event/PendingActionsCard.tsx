/**
 * Pending actions (UX-MEVT-24): a collapsible card pinned to the bottom of the organizer's event
 * page, titled with the count and collapsed by default. Expanded, each action is a row with its
 * description and a chevron, opening the screen that resolves it. Renders nothing once nothing is
 * pending — a resolved action drops out of `pendingActions` on its own.
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PendingAction } from '@/lib/pendingActions';
import { colors, radius, space } from '../../theme';
import { ListRow, Text } from '../ui';
import { Chevron } from './EventDetailParts';

export function PendingActionsCard({ actions }: { actions: PendingAction[] }) {
  const { t } = useT('event');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;

  const label = (a: PendingAction): string => {
    switch (a.key) {
      case 'teams':
        return t('pendingTeams');
      case 'spots':
        return t('pendingSpots', { count: a.count });
      case 'payments':
        return t('pendingPayments', { count: a.count });
      case 'location':
        return t('pendingLocation');
      case 'courts':
        return t('pendingCourts');
    }
  };

  const title = t('pendingActionsTitle', { count: actions.length });
  return (
    <View style={styles.card} testID="pending-actions">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={styles.head}
        testID="pending-actions-toggle"
      >
        <Text variant="bodyStrong" style={styles.flex}>
          {title}
        </Text>
        <SymbolView
          name={{ ios: open ? 'chevron.down' : 'chevron.up', android: 'expand_less', web: 'expand_less' } as never}
          tintColor={colors.mutedForeground}
          size={16}
        />
      </Pressable>
      {open
        ? actions.map((a) => (
            <ListRow
              key={a.key}
              title={label(a)}
              trailing={<Chevron />}
              onPress={() => router.push(a.href as Href)}
              testID={`pending-action-${a.key}`}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space[4],
    marginBottom: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[3] },
  flex: { flex: 1 },
});
