/**
 * TopBar — the app's one header (UX-GLOB-01). Four variants:
 *
 *   top     tab roots: left-aligned large title, no back, no divider, up to three actions
 *   nav     screens you navigate into: back left, centred title (omit `title` on entity
 *           detail screens whose name is in the body), divider, up to three actions
 *   edit    create/edit: ✕ left instead of back, centred title, divider; ✕ leaves the whole
 *           task and confirms first when `dirty`
 *   wizard  multi-step creation: back left to step back, ✕ right to leave the flow
 *
 * Both side slots are pinned to the same width — SIDE, doubled for two actions or
 * tripled for three — so the title stays centred by construction either way.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, space } from '../../theme';
import { IconButton } from './IconButton';
import { useConfirm } from './SheetHost';
import { Text } from './Text';
import { topBarLayout, type TopBarVariant } from './topBarLayout';

export type TopBarAction = { icon: string | React.ReactNode; label: string; onPress: () => void; testID?: string };

type Props = {
  variant?: TopBarVariant;
  title?: string;
  /** Back affordance (nav, wizard). */
  onBack?: () => void;
  /** Close affordance (edit, wizard). Wrapped in a discard confirmation when `dirty`. */
  onClose?: () => void;
  /** The form has unsaved input; ✕ confirms before running `onClose`. */
  dirty?: boolean;
  /** Up to three right-hand actions (top, nav, edit). */
  actions?: TopBarAction[];
  /** Deprecated single action; kept so existing call sites compile until they migrate. */
  action?: TopBarAction;
  backLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

const SIDE = 44;

export function TopBar({ variant = 'nav', title, onBack, onClose, dirty = false, actions, action, backLabel, style, testID }: Props) {
  const { t } = useT('common');
  const confirm = useConfirm();
  const rightActions = (actions ?? (action ? [action] : [])).slice(0, 3);
  const layout = topBarLayout(variant, { actionCount: rightActions.length });
  const sideStyle =
    layout.sideWidth === 'triple' ? styles.sideTriple : layout.sideWidth === 'double' ? styles.sideDouble : null;

  const close = async () => {
    if (!onClose) return;
    if (dirty) {
      const ok = await confirm({
        title: t('discardTitle'),
        body: t('discardBody'),
        confirmLabel: t('discardConfirm'),
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const backButton = onBack ? (
    <IconButton icon="‹" accessibilityLabel={backLabel ?? t('back')} size="lg" onPress={onBack} testID={testID ? `${testID}-back` : undefined} />
  ) : null;
  const closeButton = onClose ? (
    <IconButton icon="✕" accessibilityLabel={t('close')} size="lg" onPress={close} testID={testID ? `${testID}-close` : undefined} />
  ) : null;

  return (
    <View testID={testID} style={[styles.bar, layout.divider && styles.divider, style]}>
      {layout.left !== 'none' ? (
        <View style={[styles.side, sideStyle]}>{layout.left === 'back' ? backButton : closeButton}</View>
      ) : null}

      {title ? (
        <Text
          variant={layout.titleVariant}
          tone="default"
          numberOfLines={1}
          style={[styles.title, layout.titleAlign === 'left' ? styles.titleLeft : styles.titleCenter]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      <View style={[styles.side, styles.sideRight, sideStyle]}>
        {layout.right === 'close'
          ? closeButton
          : rightActions.map((a) => (
              <IconButton key={a.testID ?? a.label} icon={a.icon} accessibilityLabel={a.label} size="lg" onPress={a.onPress} testID={a.testID} />
            ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    backgroundColor: colors.background,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  side: { width: SIDE, alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' },
  sideDouble: { width: SIDE * 2 },
  sideTriple: { width: SIDE * 3 },
  title: { flex: 1 },
  titleCenter: { textAlign: 'center' },
  titleLeft: { textAlign: 'left' },
});
