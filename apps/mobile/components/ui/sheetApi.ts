/**
 * Pure confirm/show API on top of a SheetQueue — no React, no React Native.
 * Kept separate from SheetHost so this logic (and, in particular, the rule
 * that a destructive action sheet row is confirmed automatically before its
 * key is returned) can be tested directly against a queue instance.
 */
import type { ReactNode } from 'react';

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
  /** Rendered as the row's `SheetRow` `leading` slot — an avatar, an icon. */
  leading?: ReactNode;
  /**
   * Phrasing for a confirmation step this action is routed through
   * automatically before its key is returned (e.g. "Clear all
   * notifications?" / "This cannot be undone."). A destructive action always
   * gets one, defaulting to `{ title: action.label, confirmLabel: action.label }`
   * when this is omitted. A non-destructive action opts into the SAME
   * mechanism by setting this — e.g. "Assign Ana to this slot?" — so a call
   * site never needs its own follow-up `confirm()` call; the confirm sheet's
   * `destructive` flag reflects `action.destructive` either way (`false` for
   * a non-destructive action that merely asks first).
   */
  confirm?: Pick<ConfirmOptions, 'title' | 'body' | 'confirmLabel'>;
  /**
   * Keep the destructive STYLING but run no automatic confirmation — the caller
   * asks for itself. For UX-COMM-23, whose whole point is that leaving checks
   * your standing BEFORE asking anything: a last admin must be offered
   * "promote someone first", not asked to confirm and then refused. Without
   * this the row would have to drop `destructive` to take control, and lose the
   * one visual cue that it is dangerous.
   */
  selfConfirm?: boolean;
  /** Overrides the row's default `action-sheet-<key>` testID — for a call site that had its own convention before migrating to `useActionSheet`. */
  testID?: string;
};
export type ActionSheetOptions = { title?: string; actions: SheetAction[] };

export type Request =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'actions'; options: ActionSheetOptions };

export type SheetApi = {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  show: (o: ActionSheetOptions) => Promise<string | null>;
};

/**
 * `waitClosed` resolves once the host's `BottomSheet` Modal has actually
 * finished dismissing (see `SheetHost`). Both `confirm` and `show` await it
 * right before returning their FINAL value — never between the action sheet
 * and its auto-triggered confirm step, which must stay one continuously
 * presented Modal morphing its content (see the module comment on
 * `SheetHost`) — so a call site that opens its own `BottomSheet` or calls
 * another sheet method immediately after never races the host's Modal.
 */
export function createSheetApi(
  queue: SheetQueue<Request, string>,
  waitClosed: () => Promise<void> = async () => {},
): SheetApi {
  return {
    confirm: async (options) => {
      const ok = (await queue.open({ kind: 'confirm', options })) === 'confirm';
      await waitClosed();
      return ok;
    },
    show: async (options) => {
      const key = await queue.open({ kind: 'actions', options });
      if (key == null) {
        await waitClosed();
        return null;
      }
      const action = options.actions.find((a) => a.key === key);
      if ((action?.destructive || action?.confirm) && !action?.selfConfirm) {
        const phrasing = action.confirm ?? { title: action.label, confirmLabel: action.label };
        const ok =
          (await queue.open({
            kind: 'confirm',
            options: { ...phrasing, destructive: action.destructive ?? false },
          })) === 'confirm';
        await waitClosed();
        return ok ? key : null;
      }
      await waitClosed();
      return key;
    },
  };
}
