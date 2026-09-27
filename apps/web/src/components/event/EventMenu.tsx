'use client';
/**
 * The event page's ⋯ menu (UX-JEVT-06): Share, Add to calendar, and — only for a player holding a
 * place — Leave event (UX-JEVT-05). Web's twin of mobile's ⋯ sheet, as a dropdown plus the dialogs
 * its Leave row opens:
 *   - within the 12h deadline, a confirmation that the player may lose their spot — on a team
 *     event, that their partner loses theirs too and is told (decision 1);
 *   - after it, the organizer card with Chat (a 1:1 conversation, created on demand) instead of
 *     asking anything. No "Call" (decision 2).
 */
import { MoreHorizontal } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroupConfirm as Confirm } from '@/components/group/GroupConfirm';
import { LeaveLockedDialog, type PersonLite } from './EventDetailParts';

export type EventMenuDialog = 'leave' | 'leaveLocked' | null;

export function EventMenu({
  canLeave,
  teamLeave = false,
  leaveLocked,
  organizer,
  busy,
  dialog,
  setDialog,
  onShare,
  onCalendar,
  onLeave,
  onChatOrganizer,
}: {
  canLeave: boolean;
  /** A paired team player: leaving takes the partner's spot too (decision 1). */
  teamLeave?: boolean;
  leaveLocked: boolean;
  organizer: PersonLite | null;
  busy: boolean;
  dialog: EventMenuDialog;
  setDialog: (d: EventMenuDialog) => void;
  onShare: () => void;
  onCalendar: () => void;
  onLeave: () => void;
  onChatOrganizer: () => void;
}) {
  const { t } = useT('event');
  const close = () => setDialog(null);
  return (
    <>
      {/* Non-modal so the dialogs a row opens are not fighting the menu for focus and pointer. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('moreActionsLabel')} data-testid="event-more">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={onShare} data-testid="event-menu-share">
            {t('shareAction')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCalendar} data-testid="event-menu-calendar">
            {t('addToCalendarAction')}
          </DropdownMenuItem>
          {canLeave ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDialog(leaveLocked ? 'leaveLocked' : 'leave')}
                data-testid="event-menu-leave"
              >
                {t('leaveCta')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Confirm
        open={dialog === 'leave'}
        onClose={close}
        title={t('leaveConfirmTitle')}
        body={t(teamLeave ? 'leaveTeamConfirmBody' : 'leaveConfirmBody')}
        confirmLabel={t('leaveConfirmCta')}
        cancelLabel={t('cancel')}
        destructive
        busy={busy}
        onConfirm={onLeave}
      />
      <LeaveLockedDialog
        open={dialog === 'leaveLocked'}
        onClose={close}
        organizer={organizer}
        onChat={onChatOrganizer}
        chatBusy={busy}
      />
    </>
  );
}
