'use client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** A controlled confirmation; without `cancelLabel` it is an explanation with a single "OK". */
export function GroupConfirm({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {cancelLabel ? <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel> : null}
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={(e) => {
              // Stay open until the action settles, so a failure is not a dialog that vanished.
              e.preventDefault();
              void onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
