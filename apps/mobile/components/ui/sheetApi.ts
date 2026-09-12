/**
 * Pure confirm/show API on top of a SheetQueue — no React, no React Native.
 * Kept separate from SheetHost so this logic (and, in particular, the rule
 * that a destructive action sheet row is confirmed automatically before its
 * key is returned) can be tested directly against a queue instance.
 */
import type { SheetQueue } from './sheetQueue';

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type SheetAction = {
  key: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  /**
   * Phrasing for the confirmation a destructive action is routed through
   * automatically (e.g. "Clear all notifications?" / "This cannot be undone.").
   * Defaults to `{ title: action.label, confirmLabel: action.label }`.
   */
  confirm?: Pick<ConfirmOptions, 'title' | 'body' | 'confirmLabel'>;
};
export type ActionSheetOptions = { title?: string; actions: SheetAction[] };

export type Request =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'actions'; options: ActionSheetOptions };

export type SheetApi = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  show: (o: ActionSheetOptions) => Promise<string | null>;
};

export function createSheetApi(queue: SheetQueue<Request, string>): SheetApi {
  return {
    confirm: async (options) => (await queue.open({ kind: 'confirm', options })) === 'confirm',
    show: async (options) => {
      const key = await queue.open({ kind: 'actions', options });
      if (key == null) return null;
      const action = options.actions.find((a) => a.key === key);
      if (action?.destructive) {
        const phrasing = action.confirm ?? { title: action.label, confirmLabel: action.label };
        const ok =
          (await queue.open({
            kind: 'confirm',
            options: { ...phrasing, destructive: true },
          })) === 'confirm';
        return ok ? key : null;
      }
      return key;
    },
  };
}
