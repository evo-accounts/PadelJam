import { useFollowing, useGroupMembers, useMyProfile, useSearchProfiles } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { guestBlocker, rosterOverflows } from '@padel/utils';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';

import type { WizardStepProps } from '../draft';
import { GuestSheet } from '../GuestSheet';
import { InfoNote } from '../InfoNote';
import { addGuest, draftRoster, type PickablePlayer, removeGuest, togglePlayer } from '../invite';
import { colors, space } from '../../../../theme';
import {
  Avatar,
  Button,
  Checkbox,
  EmptyState,
  emptyIcon,
  ListRow,
  SearchInput,
  Text,
  useBanner,
} from '../../../ui';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Invite players (UX-CEVT-11) — only on a private event's path (`visibleSteps` skips it for a
 * public group event, decision 5).
 *
 *   Search    platform players with photo, name and a checkbox, as on the members screens. Before
 *             anything is typed: the private group's members, or the people you follow.
 *   Guests    "+ Add manually" opens a sheet (name, gender on mixed events) for someone with no
 *             access to the app; they are confirmed on creation and listed here, removable until then.
 *   Capacity  the spots left after the organizer (when playing) and the guests. Adding a guest who
 *             would not fit is refused with a banner, not left to fail at create.
 *
 * The wizard's footer carries "Create event" and, under it, "I will invite later".
 */
export function Step10Invite({ draft, patch, errors, clearError }: WizardStepProps) {
  const { t } = useT('event');
  const banner = useBanner();
  const uid = useSession().session?.user.id;
  const { data: me } = useMyProfile();
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const mixed = draft.specification === 'mixed';
  const groupId = draft.groupId;
  const room = draftRoster(draft, me?.gender);
  const overflow = rosterOverflows(room) || !!errors?.includes('guests');

  // The list before anything is typed: a private group event invites from its group; anything
  // else starts from the people you follow.
  const { data: members, isLoading: membersLoading } = useGroupMembers(groupId);
  const { data: following, isLoading: followingLoading } = useFollowing(groupId ? undefined : uid);
  const { data: found, isFetching: searching } = useSearchProfiles(term);

  const invitees = useMemo(() => draft.invitees ?? [], [draft.invitees]);
  const guests = draft.guests ?? [];
  const picked = useMemo(() => new Set(invitees.map((i) => i.invitee_id)), [invitees]);

  const people = useMemo<PickablePlayer[]>(() => {
    const seen = new Set<string>([uid ?? '']);
    const take = (list: PickablePlayer[]) =>
      list.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    if (term) return take((found ?? []) as PickablePlayer[]);
    const base: PickablePlayer[] = groupId
      ? (members ?? []).map((m) => ({
          id: m.user_id,
          full_name: m.profiles?.full_name ?? null,
          avatar_url: m.profiles?.avatar_url ?? null,
        }))
      : (following?.pages.flat() ?? []).map((f) => ({
          id: f.id,
          full_name: f.full_name,
          avatar_url: f.avatar_url,
        }));
    // Anyone picked from an earlier search stays in view, first.
    const earlier = invitees.map((i) => ({
      id: i.invitee_id,
      full_name: i.name ?? null,
      avatar_url: i.avatarUrl ?? null,
    }));
    return take([...earlier, ...base]);
  }, [term, found, groupId, members, following, invitees, uid]);

  const loading = term ? searching : groupId ? membersLoading : followingLoading;

  const openSheet = () => {
    // A full event takes no more guests: say so now instead of opening a sheet that cannot save.
    if (guestBlocker(room) === 'event_full') {
      banner.show(t('guestEventFull'));
      return;
    }
    setSheetOpen(true);
  };

  const spotsLine = room.perGender
    ? t('inviteSpotsLeftMixed', {
        count: Math.max(0, room.remaining),
        men: Math.max(0, room.perGender.male),
        women: Math.max(0, room.perGender.female),
      })
    : t('inviteSpotsLeft', { count: Math.max(0, room.remaining) });

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text variant="caption" tone="muted" style={styles.spots} testID="invite-capacity">
          {spotsLine}
        </Text>
        <Button
          label={t('inviteAddManually')}
          variant="ghost"
          size="sm"
          onPress={openSheet}
          testID="invite-add-manually"
        />
      </View>

      {overflow ? <InfoNote tone="warning" text={t('inviteOverCapacity')} testID="invite-over-capacity" /> : null}

      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('inviteSearchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="invite-search"
      />

      {guests.length > 0 ? (
        <View style={styles.block}>
          <Text variant="label" tone="muted" accessibilityRole="header">
            {t('inviteConfirmedTitle', { count: guests.length })}
          </Text>
          {guests.map((g, i) => (
            <ListRow
              key={g.key}
              title={g.name}
              subtitle={
                g.gender
                  ? `${t('inviteGuestTag')} · ${t(g.gender === 'male' ? 'genderMale' : 'genderFemale')}`
                  : t('inviteGuestTag')
              }
              variant="plain"
              leading={<Avatar name={g.name} size="md" decorative />}
              trailingInteractive
              trailing={
                <Button
                  label={t('removeCta')}
                  variant="ghost"
                  size="sm"
                  accessibilityLabel={t('inviteRemoveGuest', { name: g.name })}
                  onPress={() => {
                    patch({ guests: removeGuest(draft.guests, g.key) });
                    clearError?.('guests');
                  }}
                  testID={`invite-guest-remove-${i}`}
                />
              }
            />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <Text variant="label" tone="muted" accessibilityRole="header">
          {term ? t('inviteResultsTitle') : groupId ? t('inviteFromGroup') : t('inviteFollowingTitle')}
        </Text>
        {loading && people.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : people.length === 0 ? (
          term ? (
            <EmptyState
              icon={emptyIcon('magnifyingglass')}
              title={t('inviteNoResultsTitle')}
              body={t('inviteNoResultsBody')}
              action={{ label: t('inviteAddManually'), onPress: openSheet }}
              testID="empty-invite-search"
            />
          ) : (
            <EmptyState
              icon={emptyIcon('person.2')}
              title={t('inviteNobodyTitle')}
              body={t('inviteNobodyBody')}
              testID="empty-invite-default"
            />
          )
        ) : (
          people.map((p) => {
            const name = p.full_name ?? '—';
            const checked = picked.has(p.id);
            const toggle = () => patch({ invitees: togglePlayer(draft.invitees, p) });
            return (
              <ListRow
                key={p.id}
                title={name}
                variant="plain"
                onPress={toggle}
                leading={
                  <Avatar uri={avatarUrl(p.avatar_url)} name={name} colourKey={p.id} size="md" decorative />
                }
                trailing={
                  <Checkbox
                    checked={checked}
                    onChange={toggle}
                    accessibilityLabel={name}
                    testID={`invite-check-${p.id}`}
                  />
                }
                testID={`invite-row-${p.id}`}
              />
            );
          })
        )}
      </View>

      <GuestSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        mixed={mixed}
        room={room}
        onSave={(guest) => {
          const key = `${Date.now()}-${guests.length}`;
          patch({ guests: addGuest(draft.guests, guest, key, mixed) });
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  spots: { flex: 1 },
  block: { gap: space[1] },
  center: { alignItems: 'center', padding: space[5] },
});
