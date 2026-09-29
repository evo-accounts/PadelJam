'use client';
/**
 * Start event (UX-MEVT-23, decision 1), shared by the event page (from the scheduled time), Manage
 * Event (any time — an early start) and the live page's waiting state. Web's twin of mobile's
 * `useStartFlow`. A click asks the server (`start_event_check`) rather than guessing from the
 * cached roster:
 *
 *   blockers  fewer than 4 confirmed, an odd count with stand-by off, a mixed event with men ≠
 *             women (or a gender missing), a team event with an incomplete team → a blocking
 *             dialog naming each one, with "Manage players" and no way to start anyway;
 *   warnings  spots still open, a court left idle → a dialog stating them, "Add more players"
 *             (Manage players) or "Start anyway";
 *   neither   starts straight away.
 *
 * Returns the click handler, whether a check or a start is in flight, and the dialog to render.
 * The button never looks disabled for a rule (UX-GLOB-06): the dialog says what is wrong.
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import {
  useEventParticipants,
  useStartEvent,
  useStartEventCheck,
  type EventDetail,
  type EventType,
  type StartBlocker,
  type StartWarning,
} from '@padel/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toaster';

type DialogState = { kind: 'blocked'; blockers: StartBlocker[] } | { kind: 'warn'; warnings: StartWarning[] } | null;

export function useStartFlow(
  eventId: string,
  event: EventDetail | null | undefined,
): { onStart: () => void; pending: boolean; dialog: ReactNode } {
  const { t } = useT('event');
  const router = useRouter();
  const participants = useEventParticipants(eventId);
  // Fetched on the click, never in the background: the roster may have moved since the page loaded.
  const check = useStartEventCheck(eventId, false);
  const startEvent = useStartEvent(eventId);
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<DialogState>(null);

  const fail = (e: unknown) =>
    toast(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }), 'error');

  const start = async () => {
    if (event == null) return;
    // The server counts status='confirmed' regardless of is_standby; seeding is by join order.
    // Re-read the roster: an Americano schedule built from a stale one names the wrong players.
    const fresh = await participants.refetch();
    const confirmed = (fresh.data ?? participants.data ?? [])
      .filter((p) => p.status === 'confirmed')
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((p) => p.id);
    try {
      await startEvent.mutateAsync({
        eventType: event.event_type as EventType,
        specification: event.specification,
        confirmedParticipantIds: confirmed,
        numCourts: event.num_courts,
      });
      router.push(`/app/event/${eventId}/live`);
    } catch (e) {
      fail(e);
    }
  };

  const onStart = () => {
    if (event == null || checking || startEvent.isPending) return;
    setChecking(true);
    void check
      .refetch()
      .then(async ({ data, error }) => {
        if (error || data == null) throw error ?? new Error('unknown_error');
        if (data.blockers.length > 0) setState({ kind: 'blocked', blockers: data.blockers });
        else if (data.warnings.length > 0) setState({ kind: 'warn', warnings: data.warnings });
        else await start();
      })
      .catch(fail)
      .finally(() => setChecking(false));
  };

  const close = () => setState(null);
  const toManagePlayers = () => {
    close();
    router.push(`/app/event/${eventId}/manage/players`);
  };
  const startAnyway = () => {
    close();
    void start();
  };

  const warningLine = (w: StartWarning) =>
    w.code === 'below_capacity'
      ? t('startWarnOpenSpots', { count: w.open_spots })
      : t('startWarnIdleCourts', { count: w.idle });

  const blocked = state?.kind === 'blocked';
  const dialog =
    state == null ? null : (
      <Dialog open onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="sm:max-w-md" data-testid={blocked ? 'start-blocked-dialog' : 'start-warn-dialog'}>
          <DialogHeader>
            <DialogTitle>{t(blocked ? 'startBlockedTitle' : 'startWarnTitle')}</DialogTitle>
            <DialogDescription asChild>
              <ul className="flex flex-col gap-2 text-left">
                {state.kind === 'blocked'
                  ? state.blockers.map((b) => (
                      <li key={b} data-testid={`start-blocker-${b}`}>
                        {t(b, { defaultValue: t('unknown_error') })}
                      </li>
                    ))
                  : state.warnings.map((w) => (
                      <li key={w.code} data-testid={`start-warning-${w.code}`}>
                        {warningLine(w)}
                      </li>
                    ))}
              </ul>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {blocked ? (
              <>
                <Button className="w-full" onClick={toManagePlayers} data-testid="start-manage-players">
                  {t('managePlayersTitle')}
                </Button>
                <Button variant="secondary" className="w-full" onClick={close} data-testid="start-close">
                  {t('startSheetClose')}
                </Button>
              </>
            ) : (
              <>
                <Button className="w-full" onClick={startAnyway} data-testid="start-anyway">
                  {t('startAnywayCta')}
                </Button>
                <Button variant="secondary" className="w-full" onClick={toManagePlayers} data-testid="start-add-players">
                  {t('addMorePlayersCta')}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );

  return { onStart, pending: checking || startEvent.isPending, dialog };
}
