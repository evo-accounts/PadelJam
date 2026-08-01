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
 * `scripts/check-hex-budget.mjs` scans this directory, so a raw hex here fails
 * CI exactly as it would in a screen.
 */
export { Avatar, initialsOf, type AvatarSize } from './Avatar';
export { Badge, type BadgeTone } from './Badge';
export { Button, type ButtonSize, type ButtonVariant } from './Button';
export { Card, type CardPadding } from './Card';
export { Chip } from './Chip';
export { EmptyState } from './EmptyState';
export { Field } from './Field';
export { Loading, Screen } from './Screen';
export { Text, type TextTone, type TextVariant } from './Text';
