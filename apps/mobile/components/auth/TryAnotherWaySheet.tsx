/**
 * TryAnotherWaySheet — "Try another way", derived from what THIS ACCOUNT has
 * (UX-AUTH-04).
 *
 * The sheet it replaces was four hard-coded rows: password, a different
 * identifier, Google, Apple. Every one of them was offered to every user, so
 * three of the four were usually dead ends — a Google button that cannot sign
 * you in is worse than no button, because you only find out after the redirect.
 * The rows now come from `auth_methods_for` (migration 0096) by way of
 * `availableMethods`, and a method the account does not have is simply absent.
 *
 * `BottomSheet` + `SheetRow`, NOT `useActionSheet`. The empty state below needs
 * a title, a paragraph and two buttons; an action sheet is a flat list of rows
 * and cannot say any of it. Using the primitive directly is what buys the
 * explanation, and the explanation is the feature.
 *
 * THE EMPTY STATE IS NOT AN EDGE CASE. It covers three situations that migration
 * 0096 makes deliberately indistinguishable on the wire: this account has no
 * other method, no account exists for this identifier, and the lookup failed or
 * was rate-limited. Opening an empty sheet for any of them would read as a bug;
 * saying "this is the only way in, here is how to start again" is true in all
 * three and leaks nothing about which one it is.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import type { AuthMethod, AuthMethods } from '@/lib/authMethods';
import { space } from '../../theme';
import { BottomSheet, Button, Loading, SheetRow, Text } from '../ui';
import { tryAnotherWayRows } from './tryAnotherWayRows';

export type TryAnotherWaySheetProps = {
  visible: boolean;
  onClose: () => void;
  /** `null` while in flight or after a failed lookup — see the docblock. */
  methods: AuthMethods | null;
  /** The method the user is already using. Never listed. */
  inUse: AuthMethod;
  onPick: (method: AuthMethod) => void;
  /** Start again with a different email or phone. */
  onStartOver: () => void;
  /**
   * A lookup is running right now.
   *
   * Additive to the agreed prop list, and it earns its place: `methods` alone
   * cannot separate "not known yet" from "nothing to offer", because 0096 makes
   * a point of those being the same answer. Without this the sheet would either
   * block the tap until the lookup lands, or flash the "only way in" copy at
   * someone who does have other methods. Defaults false, so a caller that
   * always has its answer can ignore it.
   */
  loading?: boolean;
  testID?: string;
};

export function TryAnotherWaySheet({
  visible,
  onClose,
  methods,
  inUse,
  onPick,
  onStartOver,
  loading = false,
  testID,
}: TryAnotherWaySheetProps) {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const rows = tryAnotherWayRows(methods, inUse);
  const sub = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('tryAnotherWay')} testID={testID}>
      {loading ? (
        <View style={styles.block}>
          <Loading label={t('checkingMethods')} fill={false} testID={sub('loading')} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.block}>
          <Text variant="bodyStrong">{t('onlyWayInTitle')}</Text>
          <Text variant="body" tone="muted" style={styles.body}>
            {t('onlyWayInBody')}
          </Text>
          <Button label={t('useDifferentId')} fullWidth onPress={onStartOver} testID={sub('start-over')} />
          <Button
            label={tc('cancel')}
            variant="secondary"
            fullWidth
            onPress={onClose}
            style={styles.second}
            testID={sub('cancel')}
          />
        </View>
      ) : (
        <>
          {rows.map((row) => (
            <SheetRow
              key={row.method}
              // `.trim()` because a row whose identifier the server would not
              // mask interpolates to an empty string and would otherwise keep
              // the space the placeholder left behind.
              label={t(row.labelKey, { identifier: row.identifier }).trim()}
              onPress={() => onPick(row.method)}
              testID={sub(row.method)}
            />
          ))}
          {/* The escape hatch, kept out of the method rows on purpose: it is not
              a way into THIS account, so listing it among the ones that are
              would make the list mean two things at once. */}
          <Button
            label={t('useDifferentId')}
            variant="secondary"
            fullWidth
            onPress={onStartOver}
            style={styles.startOver}
            testID={sub('start-over')}
          />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space[2], paddingTop: space[2], paddingBottom: space[1] },
  body: { marginTop: space[2], marginBottom: space[5] },
  second: { marginTop: space[3] },
  startOver: { marginTop: space[4], marginHorizontal: space[2] },
});
