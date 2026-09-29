/**
 * The Teams tab of a team event's Manage players (UX-MEVT-14, 26).
 *
 *   - an instruction line, then what is still open (UX-MEVT-26): open slots, and how many of them
 *     sit in half-formed teams;
 *   - one block per team, two slots side by side. A filled slot is a card with the photo, the
 *     name, a switch icon and a ✕ in its top-right corner; an empty one a dashed outline with a
 *     "+" that opens the Select player sheet (UX-MEVT-15);
 *   - pinned under the list, the players without a team — confirmed first, then interested — as a
 *     horizontal row of cards. A card is dragged (touch and hold, then move) onto an empty slot;
 *     tapping it (or VoiceOver's activate) instead asks which team, so nothing is drag-only.
 *
 * Presentational: every change goes through the callbacks, which the screen turns into RPCs.
 * Drop targets are the EMPTY slots, measured in window coordinates when a drag starts (the list
 * may have scrolled since the last layout).
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { avatarUrl } from '@/lib/community-images';
import { colors, radius, space } from '../../../theme';
import { Avatar, Badge, IconButton, Text } from '../../ui';
import type { BoardPlayer, BoardTeam, Slot, TeamBoard } from './teamBoard';

type Props = {
  board: TeamBoard;
  /** A scheduled event; afterwards the board is read-only. */
  editable: boolean;
  onAdd: (team: BoardTeam, slot: Slot) => void;
  onSwitch: (player: BoardPlayer, team: BoardTeam) => void;
  onRemove: (player: BoardPlayer, team: BoardTeam) => void;
  /** A drag from the unassigned row dropped on an empty slot. */
  onPlace: (player: BoardPlayer, team: BoardTeam, slot: Slot) => void;
  /** A tap on an unassigned card: choose the team in a sheet. */
  onPickTeam: (player: BoardPlayer) => void;
};

type Rect = { key: string; x: number; y: number; w: number; h: number };

const CARD_W = 88;
const nameOf = (p: BoardPlayer) => p.name ?? '—';

/**
 * A View that reports its window rectangle each time `token` moves on — the drop targets and the
 * tab's origin are measured when a drag starts, in an effect, so no ref is read during render.
 */
function Measured({
  token,
  onMeasure,
  style,
  children,
}: {
  token: number;
  onMeasure: (r: Omit<Rect, 'key'>) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (token === 0) return;
    ref.current?.measureInWindow((x, y, w, h) => onMeasure({ x, y, w, h }));
    // onMeasure is a fresh closure every render; the token alone says when to measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export function TeamsTab({ board, editable, onAdd, onSwitch, onRemove, onPlace, onPickTeam }: Props) {
  const { t } = useT('event');
  const [token, setToken] = useState(0);
  const origin = useSharedValue({ x: 0, y: 0 });
  const rects = useSharedValue<Rect[]>([]);
  const hoverKey = useSharedValue<string | null>(null);
  const [dragging, setDragging] = useState<BoardPlayer | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const floating = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  const addRect = (r: Rect) => rects.set([...rects.get().filter((o) => o.key !== r.key), r]);

  const teamByKey = (key: string) => {
    const [n, slot] = key.split('-');
    const team = board.teams.find((tm) => tm.number === Number(n));
    return team && (slot === 'a' || slot === 'b') ? { team, slot: slot as Slot } : null;
  };

  const measure = () => {
    rects.set([]);
    setToken((n) => n + 1);
  };
  const hit = (ax: number, ay: number) =>
    rects.get().find((r) => ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h)?.key ?? null;
  const follow = (ax: number, ay: number) => {
    x.set(ax - origin.get().x - CARD_W / 2);
    y.set(ay - origin.get().y - CARD_W / 2);
    const key = hit(ax, ay);
    if (key !== hoverKey.get()) {
      hoverKey.set(key);
      setHover(key);
    }
  };

  const gestureFor = (player: BoardPlayer) => {
    const drag = Gesture.Pan()
      .runOnJS(true)
      .enabled(editable)
      .activateAfterLongPress(250)
      .onStart((e) => {
        measure();
        setDragging(player);
        follow(e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => follow(e.absoluteX, e.absoluteY))
      .onEnd((e) => {
        const target = teamByKey(hit(e.absoluteX, e.absoluteY) ?? '');
        if (target) onPlace(player, target.team, target.slot);
      })
      .onFinalize(() => {
        hoverKey.set(null);
        setHover(null);
        setDragging(null);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .enabled(editable)
      .onEnd((_e, ok) => {
        if (ok) onPickTeam(player);
      });
    return Gesture.Exclusive(drag, tap);
  };

  const summary =
    board.openSlots === 0
      ? t('tmAllComplete')
      : [
          t('tmOpenSlots', { count: board.openSlots }),
          board.openInHalfTeams > 0 ? t('tmHalfTeams', { count: board.openInHalfTeams }) : null,
        ]
          .filter(Boolean)
          .join(' · ');

  const renderSlot = (team: BoardTeam, slot: Slot) => {
    const player = slot === 'a' ? team.a : team.b;
    const teamName = t('teamLabel', { n: team.number });
    const id = `team-slot-${team.number}-${slot}`;
    if (player) {
      const name = nameOf(player);
      return (
        <View key={slot} style={[styles.slot, styles.filled]} testID={id}>
          {editable ? (
            <View style={styles.corner}>
              <IconButton
                icon={<SymbolView name={{ ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' } as never} size={14} tintColor={colors.mutedForeground} />}
                size="sm"
                accessibilityLabel={t('tmSwitchA11y', { name })}
                onPress={() => onSwitch(player, team)}
                testID={`${id}-switch`}
              />
              <IconButton
                icon={<SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' } as never} size={12} tintColor={colors.mutedForeground} />}
                size="sm"
                accessibilityLabel={t('tmRemoveA11y', { name })}
                onPress={() => onRemove(player, team)}
                testID={`${id}-remove`}
              />
            </View>
          ) : null}
          <Avatar uri={avatarUrl(player.avatarPath)} name={name} colourKey={player.userId ?? player.participantId} size="md" decorative />
          <Text variant="label" numberOfLines={1} style={styles.slotName} accessibilityLabel={`${teamName}: ${name}`}>
            {name}
          </Text>
          {player.guest ? <Badge label={t('guestTag')} /> : null}
        </View>
      );
    }
    const key = `${team.number}-${slot}`;
    return (
      <Measured
        key={slot}
        token={token}
        onMeasure={(r) => addRect({ key, ...r })}
        style={[styles.slot, styles.empty, hover === key && styles.emptyHover]}
      >
        {editable ? (
          <IconButton
            icon="+"
            size="lg"
            accessibilityLabel={t('tmAddToTeamA11y', { team: teamName })}
            onPress={() => onAdd(team, slot)}
            testID={`${id}-add`}
          />
        ) : null}
      </Measured>
    );
  };

  return (
    <Measured token={token} onMeasure={(r) => origin.set({ x: r.x, y: r.y })} style={styles.root}>
      <ScrollView contentContainerStyle={styles.list} scrollEnabled={dragging == null}>
        <Text variant="body" tone="muted">
          {t('tmInstruction')}
        </Text>
        <Text variant="bodyStrong" testID="teams-summary" accessibilityRole="summary">
          {summary}
        </Text>
        {board.teams.map((team) => (
          <View key={team.number} style={styles.team}>
            <View style={styles.teamHead}>
              <Text variant="label" accessibilityRole="header" style={styles.flex}>
                {t('teamLabel', { n: team.number })}
              </Text>
              <Text variant="caption" tone="muted">
                {t('tmOccupancy', { n: (team.a ? 1 : 0) + (team.b ? 1 : 0) })}
              </Text>
            </View>
            <View style={styles.slots}>
              {renderSlot(team, 'a')}
              {renderSlot(team, 'b')}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.unassigned}>
        <Text variant="label" accessibilityRole="header">
          {t('tmUnassignedTitle', { n: board.unassigned.length })}
        </Text>
        {board.unassigned.length === 0 ? (
          <Text variant="caption" tone="muted" testID="teams-unassigned-empty">
            {t('tmUnassignedEmpty')}
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} scrollEnabled={dragging == null}>
            {board.unassigned.map((player) => {
              const name = nameOf(player);
              const keen = player.status === 'interested';
              return (
                <GestureDetector key={player.participantId} gesture={gestureFor(player)}>
                  <View
                    accessible
                    accessibilityRole={editable ? 'button' : undefined}
                    accessibilityLabel={[name, keen ? t('tmKindInterested') : null].filter(Boolean).join(', ')}
                    accessibilityHint={editable ? t('tmCardHint') : undefined}
                    accessibilityActions={editable ? [{ name: 'activate' }] : undefined}
                    onAccessibilityAction={(e: AccessibilityActionEvent) => {
                      if (e.nativeEvent.actionName === 'activate') onPickTeam(player);
                    }}
                    style={[styles.card, dragging?.participantId === player.participantId && styles.cardLifted]}
                    testID={`team-unassigned-${player.participantId}`}
                  >
                    <Avatar uri={avatarUrl(player.avatarPath)} name={name} colourKey={player.userId ?? player.participantId} size="md" decorative />
                    <Text variant="caption" numberOfLines={1} style={styles.cardName}>
                      {name}
                    </Text>
                    {keen ? <Badge label={t('tmKindInterested')} /> : player.guest ? <Badge label={t('guestTag')} /> : null}
                  </View>
                </GestureDetector>
              );
            })}
          </ScrollView>
        )}
      </View>

      {dragging ? (
        <Animated.View pointerEvents="none" style={[styles.card, styles.floating, floating]}>
          <Avatar
            uri={avatarUrl(dragging.avatarPath)}
            name={nameOf(dragging)}
            colourKey={dragging.userId ?? dragging.participantId}
            size="md"
            decorative
          />
          <Text variant="caption" numberOfLines={1} style={styles.cardName}>
            {nameOf(dragging)}
          </Text>
        </Animated.View>
      ) : null}
    </Measured>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  list: { paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4], gap: space[3] },
  team: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space[3], gap: space[2] },
  teamHead: { flexDirection: 'row', alignItems: 'center' },
  slots: { flexDirection: 'row', gap: space[2] },
  slot: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[2],
    gap: space[1],
  },
  filled: { backgroundColor: colors.accent },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.background },
  emptyHover: { borderColor: colors.primary, borderWidth: 2 },
  corner: { position: 'absolute', top: space[1], right: space[1], flexDirection: 'row' },
  slotName: { maxWidth: '100%', textAlign: 'center' },
  unassigned: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[6],
    gap: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  row: { gap: space[2] },
  card: {
    width: CARD_W,
    alignItems: 'center',
    gap: space[1],
    padding: space[2],
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardLifted: { opacity: 0.35 },
  cardName: { maxWidth: '100%', textAlign: 'center' },
  floating: { position: 'absolute', left: 0, top: 0, borderColor: colors.primary, borderWidth: 2 },
});
