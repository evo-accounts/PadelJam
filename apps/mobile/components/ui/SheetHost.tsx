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
 */
import { useT } from '@padel/i18n';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { SheetRow } from './SheetRow';
import { SheetQueue, type SheetRequest } from './sheetQueue';
import { Text } from './Text';

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type SheetAction = { key: string; label: string; destructive?: boolean; disabled?: boolean };
export type ActionSheetOptions = { title?: string; actions: SheetAction[] };

type Request =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'actions'; options: ActionSheetOptions };

type Ctx = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  show: (o: ActionSheetOptions) => Promise<string | null>;
};

const SheetContext = createContext<Ctx | null>(null);

export function SheetHost({ children }: { children: ReactNode }) {
  const { t } = useT('common');
  const queue = useMemo(() => new SheetQueue<Request, string>(), []);
  const [current, setCurrent] = useState<SheetRequest<Request> | null>(null);

  useEffect(() => queue.subscribe(setCurrent), [queue]);

  const ctx = useMemo<Ctx>(
    () => ({
      confirm: async (options) => (await queue.open({ kind: 'confirm', options })) === 'confirm',
      show: async (options) => {
        const key = await queue.open({ kind: 'actions', options });
        if (key == null) return null;
        const action = options.actions.find((a) => a.key === key);
        if (action?.destructive) {
          const ok = (await queue.open({
            kind: 'confirm',
            options: { title: action.label, confirmLabel: action.label, destructive: true },
          })) === 'confirm';
          return ok ? key : null;
        }
        return key;
      },
    }),
    [queue],
  );

  const req = current;
  return (
    <SheetContext.Provider value={ctx}>
      {children}
      {req?.payload.kind === 'confirm' ? (
        <BottomSheet
          visible
          onClose={() => queue.dismiss(req.id)}
          title={req.payload.options.title}
          testID="confirm-sheet"
        >
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
        </BottomSheet>
      ) : null}
      {req?.payload.kind === 'actions' ? (
        <BottomSheet
          visible
          onClose={() => queue.dismiss(req.id)}
          title={req.payload.options.title}
          testID="action-sheet"
        >
          {req.payload.options.actions.map((a) => (
            <SheetRow
              key={a.key}
              label={a.label}
              destructive={a.destructive}
              disabled={a.disabled}
              onPress={() => queue.resolve(req.id, a.key)}
              testID={`action-sheet-${a.key}`}
            />
          ))}
        </BottomSheet>
      ) : null}
    </SheetContext.Provider>
  );
}

export function useConfirm(): Ctx['confirm'] {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useConfirm needs SheetHost above it');
  return ctx.confirm;
}

export function useActionSheet(): Ctx['show'] {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useActionSheet needs SheetHost above it');
  return ctx.show;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[2], marginBottom: space[4] },
  buttons: { gap: space[2], paddingHorizontal: space[2] },
});
