import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
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
      case 'assignCourts':
        return t('pendingAssignCourts');
    }
  };

  const go = (a: PendingAction) => {
    setOpen(false);
    router.push(a.href as Href);
  };

  return (
    <>
      <Card
        style={styles.card}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('pendingActionsTitle', { count: actions.length })}
        testID="pending-actions-card"
      >
        <Text variant="bodyStrong">{t('pendingActionsTitle', { count: actions.length })}</Text>
        <Text variant="caption" tone="muted">
          {t('pendingActionsHint')}
        </Text>
      </Card>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('pendingActionsClose')}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text variant="sectionTitle" style={styles.sheetTitle}>
              {t('pendingActionsTitle', { count: actions.length })}
            </Text>
            {actions.map((a) => (
              <ListRow
                key={a.key}
                variant="plain"
                title={label(a)}
                trailing={<Text variant="hint" tone="muted">›</Text>}
                onPress={() => go(a)}
                testID={`pending-action-${a.key}`}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 20, gap: 4 },
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
