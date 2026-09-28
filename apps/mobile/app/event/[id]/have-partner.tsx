/**
 * "I have a partner" (UX-JEVT-10), from the Team Event sheet or an interested player's
 * "Edit response → I found a partner".
 *
 * Pick one eligible player (`event_partner_candidates`, 0111/0112: the invitees and participants,
 * or the whole group on a public group event — never the caller, a blocked user, or anyone already
 * paired or waiting) and Confirm: `choose_partner` places both players as a pair with no acceptance
 * step. 'confirmed' opens the "You are going" screen; 'waiting_list' (no room for two, or pairs
 * already queued — decision 6) returns to the event, which shows the waiting-list banner.
 *
 * "+ Add manually" pairs with a guest instead (decision 7, `choose_guest_partner`, 0113).
 */
import { useChooseGuestPartner, useChoosePartner, useEventPartnerCandidates } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { filterByName } from '@padel/utils';
import { useGoBack } from '@/lib/useGoBack';
import { GuestPartnerSheet } from '../../../components/event/TeamSheets';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Button,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  SearchInput,
  Text,
  TopBar,
  useBanner,
} from '../../../components/ui';

function Radio({ on }: { on: boolean }) {
  return (
    <SymbolView
      name={
        (on
          ? { ios: 'largecircle.fill.circle', android: 'radio_button_checked', web: 'radio_button_checked' }
          : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }) as never
      }
      size={22}
      tintColor={on ? colors.primary : colors.mutedForeground}
    />
  );
}

export default function HavePartnerScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const banner = useBanner();
  const { id } = useLocalSearchParams<{ id: string }>();

  const candidates = useEventPartnerCandidates(id);
  const choose = useChoosePartner(id);
  const chooseGuest = useChooseGuestPartner(id);

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  // A guest pairing's outcome, acted on once the sheet has finished closing: navigating while its
  // Modal is still dismissing races it (the same reason TeamSheets reports choices on dismiss).
  const guestResult = useRef<'confirmed' | 'waiting_list' | null>(null);

  const all = candidates.data ?? [];
  const rows = filterByName(all, query);
  // A pick hidden by the search, or gone from the list, is not a pick.
  const selected = picked != null && all.some((c) => c.id === picked) ? picked : null;
  const busy = choose.isPending || chooseGuest.isPending;

  const done = (result: 'confirmed' | 'waiting_list') => {
    if (result === 'confirmed') {
      router.replace(`/event/${id}/joined` as Href);
    } else {
      banner.show(t('pairWaitlistToast'), 'success');
      goBack();
    }
  };

  const onConfirm = async () => {
    if (selected == null) return;
    try {
      done(await choose.mutateAsync(selected));
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const onSaveGuest = async (name: string) => {
    setGuestError(null);
    try {
      guestResult.current = await chooseGuest.mutateAsync({ name });
      setGuestOpen(false);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'invalid_guest_name') setGuestError(t(code));
      else {
        setGuestOpen(false);
        banner.show(t(code));
      }
    }
  };

  const onGuestDismissed = () => {
    const result = guestResult.current;
    guestResult.current = null;
    if (result != null) done(result);
  };

  const openGuest = () => {
    setGuestError(null);
    setGuestOpen(true);
  };

  let body: React.ReactNode;
  if (candidates.isLoading) {
    body = <ActivityIndicator color={colors.foreground} style={styles.loading} />;
  } else if (candidates.isError) {
    body = (
      <EmptyState
        tone="error"
        title={t('loadError')}
        action={{ label: t('retry', { ns: 'common' }), onPress: () => void candidates.refetch() }}
        testID="have-partner-error"
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={emptyIcon('person.2')}
        title={all.length === 0 ? t('havePartnerEmpty') : t('partnerSearchEmpty')}
        body={t('havePartnerEmptyBody')}
        action={{ label: t('addManuallyCta'), onPress: openGuest }}
        testID="have-partner-empty"
      />
    );
  } else {
    body = rows.map((c) => {
      const name = c.full_name ?? '—';
      const on = c.id === selected;
      return (
        <ListRow
          key={c.id}
          title={name}
          leading={<Avatar uri={avatarUrl(c.avatar_url)} name={name} colourKey={c.id} size="md" decorative />}
          trailing={<Radio on={on} />}
          selected={on}
          onPress={() => setPicked(c.id)}
          testID={`partner-candidate-${c.id}`}
        />
      );
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('havePartnerTitle')} />
      <View style={styles.head}>
        <Text variant="body" tone="muted">
          {t('havePartnerSubtitle')}
        </Text>
        <View style={styles.searchRow}>
          <SearchInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('partnerSearchPlaceholder')}
            autoCorrect={false}
            containerStyle={styles.flex}
            testID="have-partner-search"
          />
          <Button label={t('addManuallyShort')} variant="tertiary" size="sm" onPress={openGuest} testID="have-partner-add-manually" />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, rows.length === 0 && listEmptyContent]}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Text variant="caption" tone="muted" style={styles.center}>
          {t('havePartnerConfirmLine')}
        </Text>
        <Button
          label={t('confirmCta')}
          fullWidth
          loading={choose.isPending}
          disabled={selected == null || busy}
          onPress={() => void onConfirm()}
          testID="have-partner-confirm"
        />
        <Button label={t('cancel')} variant="secondary" fullWidth disabled={busy} onPress={goBack} />
      </View>

      <GuestPartnerSheet
        visible={guestOpen}
        onClose={() => setGuestOpen(false)}
        onSave={(name) => void onSaveGuest(name)}
        onDismissed={onGuestDismissed}
        saving={chooseGuest.isPending}
        error={guestError}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space[4], paddingTop: space[2], gap: space[3] },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  flex: { flex: 1 },
  content: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[6] },
  loading: { paddingVertical: space[6] },
  bottomBar: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[6],
    gap: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  center: { textAlign: 'center' },
});
