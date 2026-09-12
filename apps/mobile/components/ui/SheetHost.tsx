/**
 * One host renders whichever confirm / action-sheet request is open. Call sites use the hooks:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: t('deleteTitle'), body: t('deleteBody'), confirmLabel: t('delete'), destructive: true })) { … }
 *
 *   const show = useActionSheet();
 *   const key = await show({ title: name, actions: [{ key: 'remove', label: t('remove'), destructive: true }] });
 *
 * Destructive rows in an action sheet are confirmed automatically before their key is returned,
 * so a call site cannot forget the confirmation the UX rule requires.
 *
 * A single `BottomSheet` element is rendered here, its content switching between the confirm body
 * and the action rows — never two separate `BottomSheet`s. Two Modals unmount/mount across the
 * destructive flow (action sheet -> auto confirm), and iOS refuses to present the second while the
 * first is still dismissing; one Modal element stays presented and the content morphs underneath it.
 */
import { useT } from '@padel/i18n';
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { createSheetApi, type ActionSheetOptions, type ConfirmOptions, type Request, type SheetAction, type SheetApi } from './sheetApi';
import { SheetRow } from './SheetRow';
import { SheetQueue } from './sheetQueue';
import { Text } from './Text';

export type { ActionSheetOptions, ConfirmOptions, SheetAction };

const SheetContext = createContext<SheetApi | null>(null);

export function SheetHost({ children }: { children: ReactNode }) {
  const { t } = useT('common');
  const [queue] = useState(() => new SheetQueue<Request, string>());
  const req = useSyncExternalStore(queue.subscribe, queue.current);
  const ctx = useMemo(() => createSheetApi(queue), [queue]);

  return (
    <SheetContext.Provider value={ctx}>
      {children}
      <BottomSheet
        visible={req != null}
        onClose={() => req && queue.dismiss(req.id)}
        title={req?.payload.options.title}
        testID={req?.payload.kind === 'confirm' ? 'confirm-sheet' : 'action-sheet'}
      >
        {req?.payload.kind === 'confirm' ? (
          <>
            {req.payload.options.body ? (
              <Text variant="body" tone="muted" style={styles.body}>
                {req.payload.options.body}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              <Button
                label={req.payload.options.confirmLabel}
                variant={req.payload.options.destructive ? 'destructive' : 'primary'}
                fullWidth
                onPress={() => queue.resolve(req.id, 'confirm')}
                testID="confirm-sheet-confirm"
              />
              <Button
                label={req.payload.options.cancelLabel ?? t('cancel')}
                variant="ghost"
                fullWidth
                onPress={() => queue.dismiss(req.id)}
                testID="confirm-sheet-cancel"
              />
            </View>
          </>
        ) : null}
        {req?.payload.kind === 'actions'
          ? req.payload.options.actions.map((a) => (
              <SheetRow
                key={a.key}
                label={a.label}
                destructive={a.destructive}
                disabled={a.disabled}
                onPress={() => queue.resolve(req.id, a.key)}
                testID={`action-sheet-${a.key}`}
              />
            ))
          : null}
      </BottomSheet>
    </SheetContext.Provider>
  );
}

export function useConfirm(): SheetApi['confirm'] {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useConfirm needs SheetHost above it');
  return ctx.confirm;
}

export function useActionSheet(): SheetApi['show'] {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useActionSheet needs SheetHost above it');
  return ctx.show;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[2], marginBottom: space[4] },
  buttons: { gap: space[2], paddingHorizontal: space[2] },
});
