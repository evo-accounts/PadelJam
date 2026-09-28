/**
 * Settings (UX-SET-01).
 *
 * Five groups of rounded cards, each row with a leading icon, and a full-width Logout in a footer
 * that has NO heading. Every destination already exists — the whole series built them first — so
 * this moves rows and nothing else.
 *
 * TWO THINGS HERE ARE LOAD-BEARING FOR THE E2E SUITE, both about how selectors match.
 *
 * `e2e/driver/flows.ts` logs out by `tap({ text: /log out/i })` with no type filter and no `nth`,
 * which takes the FIRST match in accessibility-tree order. It is reached from suites 03, 04, 06,
 * 08, 09, 10 and 98 through `switchUser`. So the footer must not carry a heading matching that
 * text: a heading is StaticText, it would sort before the Button, and tapping it is a silent
 * no-op — seven suites failing at once on a selector that still "found" something. The audit asks
 * for a bare footer and that is what this is.
 *
 * The Notifications group heading and the Notifications row are the same word, which is the same
 * trap one level down. The row carries `settings-notifications-row` and suite 12 selects the
 * switch by id and deep-links past this screen entirely (PR 14), so the collision is already
 * defused — but do not remove those ids on the assumption that the text is unambiguous. It is not.
 */
import { useAccountPlan, useOwnedCommunities } from '@padel/api';
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { unregisterForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type as typeScale, weight } from '../../theme';
import { BottomSheet, Button, ListRow, Screen, Text, TopBar } from '../../components/ui';

const icon = (ios: string, android: string) => (
  <SymbolView
    name={{ ios, android, web: android } as never}
    size={22}
    tintColor={colors.foreground}
    accessibilityElementsHidden
    importantForAccessibility="no"
  />
);

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.section}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const accountPlan = useAccountPlan();
  const owned = useOwnedCommunities();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Neutral while the plan query is loading: `data` is undefined then, and defaulting to
  // "planJammer" would flash the free label at a Jammer+ member before it resolves.
  const planLabel = accountPlan.isLoading
    ? undefined
    : t(accountPlan.data === 'jammer_plus' ? 'planJammerPlus' : 'planJammer');

  const communities = owned.data ?? [];

  /**
   * One community goes straight to its Plan section; several open a picker, because
   * `?section=plan` needs a single id and there is no multi-community plan screen. None hides the
   * row entirely — see `useOwnedCommunities` for why the gate is `created_by` and not "any admin".
   */
  const onCommunityPlans = () => {
    if (communities.length === 1) {
      router.push(`/community/${communities[0]!.id}/manage?section=plan`);
      return;
    }
    setPickerOpen(true);
  };

  const onLogout = async () => {
    try {
      await unregisterForPush();
    } catch {
      /* best-effort; never block sign-out */
    }
    await signOut(supabase);
    router.replace('/(auth)/sign-in');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('settings')} onBack={() => router.back()} />
      <Screen scroll padded={false} style={styles.content}>
        <Group title={t('account')}>
          <ListRow
            leading={icon('person.crop.circle', 'account_circle')}
            title={t('accountTitle')}
            onPress={() => router.push('/profile/account')}
            testID="settings-account-row"
          />
          <ListRow
            leading={icon('sportscourt', 'sports_tennis')}
            title={t('gameTitle')}
            onPress={() => router.push('/profile/game')}
            testID="settings-game-row"
          />
          <ListRow
            leading={icon('hand.raised', 'block')}
            title={t('privacyTitle')}
            onPress={() => router.push('/profile/privacy')}
            testID="settings-privacy-row"
          />
        </Group>

        <Group title={t('notifications')}>
          <ListRow
            leading={icon('bell', 'notifications')}
            title={t('notifications')}
            onPress={() => router.push('/profile/notifications')}
            testID="settings-notifications-row"
          />
        </Group>

        <Group title={t('subscription')}>
          <ListRow
            leading={icon('star.circle', 'workspace_premium')}
            title={t('jammerPlusRow')}
            trailing={planLabel ? <Text variant="body" tone="muted">{planLabel}</Text> : undefined}
            trailingLabel={planLabel}
            onPress={() => router.push('/profile/plan')}
            testID="settings-jammer-row"
          />
          {communities.length > 0 ? (
            <ListRow
              leading={icon('building.2', 'groups')}
              title={t('communityPlansRow')}
              onPress={onCommunityPlans}
              testID="settings-community-plans-row"
            />
          ) : null}
        </Group>

        <Group title={t('support')}>
          <ListRow
            leading={icon('lifepreserver', 'support')}
            title={t('supportAndFeedback')}
            onPress={() => router.push('/profile/support')}
            testID="settings-support-row"
          />
          <ListRow
            leading={icon('slider.horizontal.3', 'tune')}
            title={t('appPreferencesTitle')}
            onPress={() => router.push('/profile/app-preferences')}
            testID="settings-app-preferences-row"
          />
        </Group>

        <Group title={t('legal')}>
          <ListRow
            leading={icon('doc.text', 'description')}
            title={t('legal')}
            onPress={() => router.push('/profile/legal')}
            testID="settings-legal-row"
          />
        </Group>

        {/* No heading. See the note at the top of this file — a StaticText matching /log out/i
            here breaks `switchUser` across seven suites. */}
        <Button
          label={t('logout')}
          variant="tertiary"
          fullWidth
          style={styles.logout}
          onPress={onLogout}
          testID="settings-logout"
        />
      </Screen>

      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('communityPlansRow')}
        testID="community-plan-picker"
      >
        {communities.map((c) => (
          <ListRow
            key={c.id}
            title={c.name}
            onPress={() => {
              setPickerOpen(false);
              router.push(`/community/${c.id}/manage?section=plan`);
            }}
            testID={`community-plan-${c.id}`}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[5] },
  group: { gap: space[2] },
  section: {
    fontSize: typeScale.caption.fontSize,
    fontWeight: weight.bold,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
  },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  logout: { marginTop: space[2], alignItems: 'center', paddingVertical: 14 },
});
