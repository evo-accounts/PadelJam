'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { avatarUrl } from '@/lib/upload';

export interface RosterParticipant {
  id: string;
  user_id: string | null;
  status: string;
  is_standby: boolean;
  has_paid: boolean;
  joined_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

export function RosterRow({
  p,
  feeEnabled,
  onConfirm,
  onTogglePaid,
  onRemove,
}: {
  p: RosterParticipant;
  feeEnabled: boolean;
  onConfirm: (name: string) => void;
  onTogglePaid: (paid: boolean, name: string) => void;
  onRemove: (mode: 'to_invited' | 'from_event', name: string) => void;
}) {
  const { t } = useT('event');
  const name = p.profiles?.full_name ?? p.guest_name ?? '—';
  const [confirmRemove, setConfirmRemove] = useState<null | 'to_invited' | 'from_event'>(null);
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-9">
          <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} />
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{name}</span>
        {feeEnabled ? (
          <Badge variant={p.has_paid ? 'secondary' : 'outline'}>
            {p.has_paid ? t('paidBadge') : t('unpaidBadge')}
          </Badge>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">⋯</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {p.status !== 'confirmed' ? (
            <DropdownMenuItem onClick={() => onConfirm(name)}>{t('markConfirmedCta')}</DropdownMenuItem>
          ) : null}
          {feeEnabled ? (
            <DropdownMenuItem onClick={() => onTogglePaid(!p.has_paid, name)}>
              {p.has_paid ? t('unpaidBadge') : t('paidBadge')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => setConfirmRemove('to_invited')}>{t('removeToInvitedCta')}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmRemove('from_event')}>
            {t('removeFromEventCta')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmRemove != null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('removeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('removeConfirmBody', { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemove) onRemove(confirmRemove, name);
                setConfirmRemove(null);
              }}
            >
              {t('removeCta')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
