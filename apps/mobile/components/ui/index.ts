/**
 * The mobile primitive set.
 *
 * These live here rather than in `packages/ui` because there is exactly one
 * React Native consumer, and a shared package earns its keep on the second.
 * Putting RN components in `packages/ui` would also drag `react-native` into the
 * web graph the moment Next imports a token. Promotion later is near-free —
 * every one of these is a token-consuming leaf.
 *
 * They take colours, radii, type and spacing ONLY from `apps/mobile/theme`;
 * the `no-restricted-syntax` rule in `apps/mobile/eslint.config.mjs` rejects a
 * raw hex here exactly as it would in a screen.
 */
export { Avatar, initialsOf, type AvatarSize } from './Avatar';
export { Badge, type BadgeTone } from './Badge';
export { BannerProvider, useBanner } from './Banner';
export { BottomSheet } from './BottomSheet';
export { Button, type ButtonSize, type ButtonVariant } from './Button';
export { Card, type CardPadding } from './Card';
export { Chip } from './Chip';
export { EmptyState, listEmptyContent } from './EmptyState';
export { emptyIcon } from './emptyIcon';
export { Field } from './Field';
export { IconButton, type IconButtonSize } from './IconButton';
export { ListRow, type ListRowVariant } from './ListRow';
export { PasswordField } from './PasswordField';
export { SheetHost, useConfirm, useActionSheet, type ConfirmOptions, type ActionSheetOptions, type SheetAction } from './SheetHost';
export { SheetRow } from './SheetRow';
export { TopBar } from './TopBar';
export { Loading, Screen } from './Screen';
export { Text, type TextTone, type TextVariant } from './Text';
