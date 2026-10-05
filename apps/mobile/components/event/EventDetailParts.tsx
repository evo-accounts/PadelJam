/**
 * The building blocks of the event page (UX-JEVT-02). Every event state reuses this body and
 * changes only the top banner and the fixed bottom area, so the pieces live here and the screen
 * (`app/event/[id]/index.tsx`) only decides which ones to show.
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import type { BannerState, EventPlace } from '@padel/utils';

import { colors, palette, radius, space } from '../../theme';
import { Avatar, BottomSheet, Button, ListRow, Text } from '../ui';

export type PersonLite = { id: string; full_name: string | null; avatar_url: string | null };

export const Chevron = () => (
  <Text variant="body" tone="muted">
    ›
  </Text>
);

/**
 * Three overlapping confirmed-player photos, "Players", and confirmed / capacity. The organizer's
 * "Manage players" row (UX-MEVT-01) is the same card under its own title.
 */
export function PlayersCard({
  people,
  confirmed,
  capacity,
  onPress,
  title,
  testID = 'event-players-card',
}: {
  people: { id: string; name: string | null; uri: string | null }[];
  confirmed: number;
  capacity: number;
  onPress: () => void;
  title?: string;
  testID?: string;
}) {
  const { t } = useT('event');
  const shown = people.slice(0, 3);
  return (
    <ListRow
      variant="card"
      title={title ?? t('playersTitle')}
      subtitle={t('playersCapacity', { confirmed, capacity })}
      onPress={onPress}
      leading={
        shown.length > 0 ? (
          <View style={styles.stack}>
            {shown.map((p, i) => (
              <Avatar
                key={p.id}
                uri={p.uri}
                name={p.name}
                colourKey={p.id}
                size="sm"
                decorative
                style={i > 0 ? { ...styles.ring, marginLeft: -10 } : styles.ring}
              />
            ))}
          </View>
        ) : undefined
      }
      trailing={<Chevron />}
      testID={testID}
    />
  );
}

/**
 * Courts / Scoring / Fee, side by side. Read-only for everyone, the organizer included.
 * Each widget's label and value are read as two Texts rather than grouped into one accessible
 * View — see StateBanner for why this page avoids accessible non-button Views.
 */
export function InfoWidgets({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={styles.widgets}>
      {items.map((w) => (
        <View key={w.label} style={styles.widget}>
          <Text variant="hint" tone="muted" numberOfLines={1}>
            {w.label}
          </Text>
          <Text variant="label" numberOfLines={2} style={styles.widgetValue}>
            {w.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Photo, name, a caption, and a chevron to their profile. */
export function PersonCard({
  person,
  caption,
  onPress,
  testID,
}: {
  person: PersonLite;
  caption: string;
  onPress?: () => void;
  testID?: string;
}) {
  const name = person.full_name ?? '—';
  return (
    <ListRow
      variant="card"
      title={name}
      subtitle={caption}
      onPress={onPress}
      leading={<Avatar uri={avatarUrl(person.avatar_url)} name={name} colourKey={person.id} size="md" decorative />}
      trailing={onPress ? <Chevron /> : undefined}
      testID={testID}
    />
  );
}

/** Venue name and address; opens the native maps app. */
export function LocationCard({ place, onPress }: { place: EventPlace; onPress: () => void }) {
  return (
    <ListRow
      variant="card"
      title={place.name}
      subtitle={place.address ?? undefined}
      subtitleLines={2}
      onPress={onPress}
      leading={
        <View style={styles.pin}>
          <SymbolView
            name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' } as never}
            size={20}
            tintColor={colors.primary}
          />
        </View>
      }
      trailing={<Chevron />}
      testID="event-location-card"
    />
  );
}

/**
 * The strip under the header: "You are going", stand-by, the waiting-list explanation, or — for a
 * team-event player looking for a partner — "You are interested" (UX-JEVT-13).
 */
export function StateBanner({ state }: { state: Exclude<BannerState, null> }) {
  const { t } = useT('event');
  const waiting = state === 'waiting_list';
  // Literal keys, so scripts/check-i18n-keys.mjs can see every one of them.
  const title =
    state === 'going'
      ? t('goingBanner')
      : state === 'standby'
        ? t('standbyBadge')
        : state === 'interested'
          ? t('interestedBanner')
          : t('waitlistBannerTitle');
  return (
    // A plain View whose Texts are read one by one — deliberately NOT `accessible` with a role.
    // On #210's E2E runs, after this page unmounted, the NEXT screen's buttons (sign-in's
    // Continue, a tab) came back from idb as `AXGenericElement` while still carrying the Button
    // trait, so `{ type: 'Button' }` selectors stopped matching. Fabric recycles native views
    // between screens, and the suspected source is the one thing new on this page: accessible,
    // non-button Views (this banner with role "summary", the widgets, the inviter row) — the old
    // page had none. Keeping them non-accessible keeps that pool clean.
    <View
      style={[
        styles.banner,
        waiting ? styles.bannerWaiting : state === 'interested' ? styles.bannerInterested : styles.bannerGoing,
      ]}
      testID={`event-banner-${state}`}
    >
      <Text variant="bodyStrong">{title}</Text>
      {waiting ? (
        <Text variant="caption" tone="muted" style={styles.bannerBody}>
          {t('waitlistBannerBody')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Past the 12h leave deadline (UX-JEVT-05): no self-leave, only the organizer and a way to reach
 * them. Chat only — decision 2 drops "Call" (phones stop being readable by other users).
 */
export function LeaveLockedSheet({
  visible,
  onClose,
  organizer,
  onChat,
  chatLoading,
}: {
  visible: boolean;
  onClose: () => void;
  organizer: PersonLite | null;
  onChat: () => void;
  chatLoading: boolean;
}) {
  const { t } = useT('event');
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('leaveLockedTitle')} testID="leave-locked-sheet">
      <Text variant="body" tone="muted" style={styles.sheetBody}>
        {t('leaveLockedSheetBody')}
      </Text>
      {organizer ? (
        <View style={styles.sheetOrganizer}>
          <PersonCard person={organizer} caption={t('organizerLabel')} />
        </View>
      ) : null}
      <View style={styles.sheetButtons}>
        <Button label={t('chatCta')} fullWidth loading={chatLoading} onPress={onChat} testID="leave-locked-chat" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row' },
  ring: { borderWidth: 2, borderColor: colors.card },
  widgets: { flexDirection: 'row', gap: space[2] },
  widget: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space[3],
    gap: space[1],
  },
  widgetValue: { color: colors.foreground },
  pin: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: palette.purple[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: { marginHorizontal: space[4], marginTop: space[2], padding: space[3], borderRadius: radius.xl },
  bannerGoing: { backgroundColor: palette.green[100] },
  bannerWaiting: { backgroundColor: palette.yellow[100] },
  bannerInterested: { backgroundColor: palette.purple[100] },
  bannerBody: { marginTop: space[1] },
  sheetBody: { paddingHorizontal: space[2], marginBottom: space[4] },
  sheetOrganizer: { paddingHorizontal: space[2], marginBottom: space[4] },
  sheetButtons: { paddingHorizontal: space[2] },
});
