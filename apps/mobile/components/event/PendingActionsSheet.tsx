import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';
import { Card, ListRow, Text } from '../ui';
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

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessible={false}>
          {/* A responder-claiming View so taps inside the sheet do not reach the backdrop. */}
          <View style={styles.sheet} accessibilityViewIsModal onStartShouldSetResponder={() => true}>
            <Text variant="sectionTitle" style={styles.sheetTitle}>
              {t('pendingActionsTitle', { count: actions.length })}
            </Text>
            {actions.map((a) => (
              <ListRow
                key={a.key}
                title={label(a)}
                trailing={
                  <Text variant="hint" tone="muted" accessibilityElementsHidden importantForAccessibility="no">
                    ›
                  </Text>
                }
                onPress={() => go(a)}
                testID={`pending-action-${a.key}`}
              />
            ))}
            <ListRow title={t('pendingActionsClose')} onPress={() => setOpen(false)} testID="pending-actions-close" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 20 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardText: { flex: 1, gap: 4 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 8,
  },
  sheetTitle: { paddingHorizontal: 8, marginBottom: 8 },
});
