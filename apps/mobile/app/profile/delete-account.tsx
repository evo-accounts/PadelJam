/**
 * Delete account (UX-SET-11).
 *
 * The screen existed but read as a loose warning and three bullets. It becomes what the audit
 * asks for: a warning card with a red accent, a card listing what is removed, and a fixed
 * destructive action that opens a FINAL confirmation before anything happens.
 *
 * Reached from Account Settings, which is where the audit puts the entry — it was a loose
 * destructive row under "Conta" before.
 *
 * The teardown itself is unchanged: the `delete-account` edge function calls
 * `soft_delete_account()` as the caller and then bans the auth user, because a hard delete is
 * impossible against the NOT NULL / RESTRICT foreign keys from owned communities and events.
 */
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { unregisterForPush } from '@/lib/push';
import { SUPABASE_URL, supabase } from '@/lib/supabase';
import { Button, Card, Screen, Text, TopBar, useBanner, useConfirm } from '../../components/ui';
import { colors, radius, space } from '../../theme';

export default function DeleteAccountScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const confirm = useConfirm();
  const banner = useBanner();
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        banner.show(t('deleteFailed'));
        return;
      }
      try {
        await unregisterForPush();
      } catch {
        /* best-effort; the migration also purges tokens server-side */
      }
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        /**
         * The function returns the RPC's own message, and one of them is ACTIONABLE: migration
         * 0098 refuses to delete the sole admin of a community, because doing so would strand it
         * with nobody able to manage it. Reporting that as "couldn't delete your account, please
         * try again" tells the user to repeat something that will never work.
         */
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
        const soleAdmin = body?.error?.includes('last_admin_must_promote_first');
        banner.show(t(soleAdmin ? 'deleteBlockedSoleAdmin' : 'deleteFailed'));
        return;
      }
      await signOut(supabase);
      router.replace('/(auth)/welcome');
    } catch {
      banner.show(t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onDeletePress = async () => {
    if (busy) return;
    const ok = await confirm({
      title: t('deleteWarningTitle'),
      body: t('deleteWarningBody'),
      confirmLabel: t('deleteConfirm'),
      cancelLabel: t('deleteCancel'),
      destructive: true,
    });
    if (ok) await doDelete();
  };

  const removed = [
    t('deleteErasedProfile'),
    t('deleteErasedMemberships'),
    t('deleteErasedSocial'),
    t('deleteErasedPayment'),
    t('deleteErasedOther'),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('deleteAccount')} onBack={() => router.back()} />
      <Screen scroll padded={false} style={styles.content}>
        {/* The red accent is a border, not a fill: a solid destructive block behind body text
            fails contrast at this size, and the audit asks for an accent rather than a slab. */}
        <Card padding="md" style={styles.warning} testID="delete-warning">
          <Text variant="bodyStrong" tone="destructive">
            {t('deleteWarningTitle')}
          </Text>
          <Text variant="body" tone="muted">
            {t('deleteWarningBody')}
          </Text>
        </Card>

        <Card padding="md" style={styles.list} testID="delete-list">
          <Text variant="label">{t('deleteListTitle')}</Text>
          {removed.map((item) => (
            <View key={item} style={styles.item}>
              <Text variant="body" tone="muted">
                {'•'}
              </Text>
              <Text variant="body" tone="muted" style={styles.itemText}>
                {item}
              </Text>
            </View>
          ))}
        </Card>
      </Screen>

      <View style={styles.footer}>
        <Button
          variant="destructive"
          fullWidth
          label={t('deleteConfirm')}
          onPress={onDeletePress}
          loading={busy}
          testID="delete-account-action"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[3] },
  warning: { gap: space[2], borderColor: colors.destructive, borderWidth: 1, borderRadius: radius.md },
  list: { gap: space[2] },
  item: { flexDirection: 'row', gap: space[2] },
  itemText: { flex: 1 },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
