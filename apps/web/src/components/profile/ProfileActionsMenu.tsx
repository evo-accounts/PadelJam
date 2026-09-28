'use client';
/**
 * The UX-PROF-02 actions menu, in one place — web's counterpart to mobile's `useProfileActions`.
 *
 * It lived inline in the profile page while that was its only caller. UX-PROF-05 adds a second:
 * every row of the follower and following lists carries a "⋯" that opens "the same actions sheet
 * defined in UX-PROF-02". Copying it would have meant two definitions of which actions exist, when
 * Message is offered, and what blocking says.
 *
 * Unlike mobile, this mounts its own dialogs: Radix renders nothing while closed, so one per row
 * costs nothing, and web has no equivalent of React Native's one-Modal-at-a-time constraint.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBlock, useFollow, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { ReportDialog } from './ReportDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ActionPerson = { id: string; full_name: string | null; is_following: boolean };

export function ProfileActionsMenu({
  person,
  onBlocked,
}: {
  person: ActionPerson;
  onBlocked?: (id: string) => void;
}) {
  const { t } = useT('profile');
  const router = useRouter();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const block = useBlock();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="tertiary" size="icon" aria-label={t('more')}>
            …
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              void navigator.clipboard?.writeText(
                `${window.location.origin}/app/profile/${person.id}`,
              )
            }
          >
            {t('share')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => (person.is_following ? unfollow : follow).mutate(person.id)}
          >
            {person.is_following ? t('unfollow') : t('follow')}
          </DropdownMenuItem>
          {/* Only once you follow them — the same gate as mobile, because it matches the surface it
              opens onto: the chat list is built from the people you follow. */}
          {person.is_following ? (
            <DropdownMenuItem onSelect={() => router.push('/app/chat')}>
              {t('message')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setBlockOpen(true)}>{t('block')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>{t('report')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* UX-PROF-03: a confirmation that states the consequence. */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('blockTitle')}</DialogTitle>
            <DialogDescription>{t('blockBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBlockOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={block.isPending}
              onClick={() =>
                block.mutate(person.id, {
                  onSuccess: () => {
                    setBlockOpen(false);
                    onBlocked?.(person.id);
                  },
                })
              }
            >
              {t('block')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportDialog targetId={person.id} open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}
