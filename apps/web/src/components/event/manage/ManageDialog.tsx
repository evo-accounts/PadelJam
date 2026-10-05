'use client';
/**
 * The chrome every Manage Event dialog shares (UX-MEVT-04..08, 19–21) — web's twin of mobile's
 * `ManageSheet`, as a Radix dialog (UX-GLOB-02 on web, like the Team Event dialogs): title, ✕
 * top-right, a body that scrolls, and a fixed footer with the primary action over a secondary
 * Cancel. A failed submit shows its message in the footer (UX-GLOB-06); success closes the dialog
 * and the caller raises a toast.
 */
import type { ReactNode } from 'react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function ManageDialog({
  title,
  description,
  onClose,
  primaryLabel,
  onPrimary,
  busy = false,
  destructive = false,
  error,
  children,
  testId,
}: {
  title: string;
  /** Read by screen readers as the dialog's description; hidden when absent. */
  description?: string;
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  busy?: boolean;
  destructive?: boolean;
  error?: string | null;
  children: ReactNode;
  /** The dialog is `{testId}`; primary `{testId}-save`, Cancel `{testId}-cancel`. */
  testId: string;
}) {
  const { t } = useT('event');
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        // No dismissing mid-save: the result would land with the dialog already gone.
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg"
        data-testid={testId}
      >
        <DialogHeader className="border-b px-6 pt-6 pb-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
        </DialogHeader>
        {/* Not a <form>: the wizard steps inside open dialogs of their own (custom points,
            duration) whose submit would bubble through the React tree into this one. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">{children}</div>
          <div className="flex flex-col gap-2 border-t px-6 pt-4 pb-6">
            {error ? (
              <p role="alert" className="text-sm text-destructive" data-testid={`${testId}-error`}>
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'primary'}
              className="w-full"
              disabled={busy}
              onClick={onPrimary}
              aria-busy={busy || undefined}
              data-testid={`${testId}-save`}
            >
              {primaryLabel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={onClose}
              data-testid={`${testId}-cancel`}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
