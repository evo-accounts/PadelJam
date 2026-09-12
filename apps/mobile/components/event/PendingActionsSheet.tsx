import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Card, SheetRow, Text } from '../ui';
import type { PendingAction } from '@/lib/pendingActions';

type Props = { actions: PendingAction[] };

/**
 * JM-38: "You have N pending actions" card on the organizer's event detail. Tapping it opens a
 * checklist; each row navigates to the screen that resolves it. Renders nothing when empty.
 */
export function PendingActionsSheet({ actions }: Props) {
  const { t } = useT('event');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;

  const label = (a: PendingAction) => {
    switch (a.key) {
      case 'addPlayers':
        return t('pendingAddPlayers', { count: a.count });
      case 'setUpTeams':
        return t('pendingSetUpTeams', { count: a.count });
      case 'setLocation':
        return t('pendingSetLocation');
    }
  };

  const go = (a: PendingAction) => {
    setOpen(false);
    router.push(a.href as Href);
  };

  return (
    <>
      <Card style={styles.card} onPress={() => setOpen(true)} testID="pending-actions-card">
        <View style={styles.cardRow}>
          <View style={styles.cardText}>
            <Text variant="bodyStrong">{t('pendingActionsTitle', { count: actions.length })}</Text>
            <Text variant="caption" tone="muted">
              {t('pendingActionsHint')}
            </Text>
          </View>
          <Text variant="hint" tone="muted" accessibilityElementsHidden importantForAccessibility="no">
            ›
          </Text>
        </View>
      </Card>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('pendingActionsTitle', { count: actions.length })}
        testID="pending-actions-sheet"
      >
        {actions.map((a) => (
          <SheetRow key={a.key} label={label(a)} onPress={() => go(a)} testID={`pending-action-${a.key}`} />
        ))}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 20 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardText: { flex: 1, gap: 4 },
});
