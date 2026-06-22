'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useEventMatches, useFinishEvent } from '@padel/api';
import { allScored } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function FinishDialog({
  eventId,
  countsForRanking,
}: {
  eventId: string;
  countsForRanking: boolean;
}) {
  const { t } = useT('event');
  const matches = useEventMatches(eventId);
  const finishEvent = useFinishEvent(eventId);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [rankingEnabled, setRankingEnabled] = useState(countsForRanking);
  const [err, setErr] = useState<string | null>(null);

  const scored = allScored(matches.data ?? []);

  const onConfirm = () => {
    setErr(null);
    finishEvent
      .mutateAsync({
        countsOverride: rankingEnabled,
        finishMessage: message.trim() || undefined,
      })
      .then(() => setOpen(false))
      .catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="self-start">{t('finishCta')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{scored ? t('finishConfirmTitle') : t('finishEarlyTitle')}</DialogTitle>
          <DialogDescription>{scored ? t('finishConfirmBody') : t('finishEarlyBody')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="finish-message">{t('finishMessageLabel')}</Label>
            <Textarea
              id="finish-message"
              value={message}
              onChange={(ev) => setMessage(ev.target.value)}
              placeholder={t('finishMessagePlaceholder')}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="finish-ranking">{t('rankingToggleLabel')}</Label>
            <Switch id="finish-ranking" checked={rankingEnabled} onCheckedChange={setRankingEnabled} />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button disabled={finishEvent.isPending} onClick={onConfirm}>
            {t('finishCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
