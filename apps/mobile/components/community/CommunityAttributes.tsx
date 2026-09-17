/**
 * The three attribute widgets of UX-COMM-04: type, member count and privacy,
 * side by side, each a card with an icon, a value and a label.
 *
 * The audit is explicit that these are CARDS, not text chips — the chips are
 * what `CommunityHero` showed, and they read as decoration rather than as the
 * three facts someone weighs before joining.
 *
 * Everything arrives as props. `CommunityHero` re-queried the community and the
 * member list itself so it could be dropped above any layout, which meant two
 * more round trips on a screen that had already loaded both, and a member count
 * that could disagree with the one beside it. The preview owns those queries.
 *
 * Glyphs follow the placeholder convention set by `Illustration`: an emoji in a
 * registry, hidden from assistive tech, with the value and label carrying the
 * meaning. Each card is ONE accessible element announcing "Members, 24" rather
 * than three nodes a screen reader walks separately.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '../ui';
import { space } from '../../theme';

const TYPE_KEY: Record<string, string> = {
  club: 'typeClub',
  team: 'typeTeam',
  friends: 'typeFriends',
};

const TYPE_GLYPH: Record<string, string> = {
  club: '🏟',
  team: '🛡',
  friends: '🤝',
};

const PRIVACY_KEY: Record<string, string> = {
  public: 'privacyPublicTitle',
  request_to_join: 'privacyRequestTitle',
  private: 'privacyPrivateTitle',
};

const PRIVACY_GLYPH: Record<string, string> = {
  public: '🌐',
  request_to_join: '✋',
  private: '🔒',
};

type Props = {
  type: string;
  privacy: string;
  /** Null when the roster could not be read — the card says so rather than showing a false 0. */
  memberCount: number | null;
};

export function CommunityAttributes({ type, privacy, memberCount }: Props) {
  const { t } = useT('community');

  const cards = [
    {
      key: 'type',
      glyph: TYPE_GLYPH[type] ?? TYPE_GLYPH.club,
      value: t(TYPE_KEY[type] ?? 'typeClub'),
      label: t('aboutTypeLabel'),
    },
    {
      key: 'members',
      glyph: '👥',
      value: memberCount == null ? '—' : String(memberCount),
      label: t('aboutMembersLabel'),
    },
    {
      key: 'privacy',
      glyph: PRIVACY_GLYPH[privacy] ?? PRIVACY_GLYPH.public,
      value: t(PRIVACY_KEY[privacy] ?? 'privacyPublicTitle'),
      label: t('aboutPrivacyLabel'),
    },
  ];

  return (
    <View style={styles.row} testID="community-attributes">
      {cards.map((card) => (
        <Card key={card.key} padding="sm" style={styles.card}>
          {/*
            The grouping lives on this View, not on Card: Card puts
            `accessibilityLabel` on a plain View without `accessible`, which iOS
            ignores — the three Texts would be walked one at a time and the glyph
            announced on its own. Grouped here, it is a single element saying
            "Members, 24".
          */}
          <View
            accessible
            accessibilityLabel={`${card.label}, ${card.value}`}
            style={styles.cardBody}
          >
            <Text variant="sectionTitle">{card.glyph}</Text>
            <Text variant="label" numberOfLines={1} style={styles.value}>
              {card.value}
            </Text>
            <Text variant="hint" tone="muted" numberOfLines={1}>
              {card.label}
            </Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[2] },
  // `flex: 1` with `minWidth: 0` so a long value shrinks its own card rather than
  // pushing the third one off the row.
  card: { flex: 1, minWidth: 0 },
  cardBody: { alignItems: 'center', gap: space[1] },
  value: { textAlign: 'center' },
});
