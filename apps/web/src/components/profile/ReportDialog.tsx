'use client';
import { useState } from 'react';
import { useReport } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/**
 * The five values `reports.reason` accepts (migration 0055). `fake` was missing here while mobile
 * offered it and the CHECK constraint allowed it, so "Fake profile" was reportable on one client
 * and not the other — a pre-existing divergence, closed here rather than left for someone to
 * rediscover from a moderation queue that never sees the category.
 */
const REASONS = ['harassment', 'inappropriate', 'spam', 'fake', 'other'] as const;

export function ReportDialog({
  targetId,
  open,
  onOpenChange,
}: {
  targetId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useT('profile');
  const report = useReport();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  // Inline status rather than a toast: web has no toast mechanism, and the profile edit page
  // already reports success and failure this way. Adding a toast library for one dialog would be
  // a new dependency and a second feedback idiom in the same app.
  const [failed, setFailed] = useState(false);

  const submit = () => {
    if (!reason) return;
    setFailed(false);
    report.mutate(
      { targetId, reason, description: description || undefined },
      {
        onSuccess: () => {
          setReason('');
          setDescription('');
          setFailed(false);
          onOpenChange(false);
        },
        // Was silent: a report that never landed looked exactly like one that did.
        onError: () => setFailed(true),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('reportTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder={t('reportReason')} />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`reportReason_${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder={t('reportDetails')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <DialogFooter className="items-center gap-3">
          {failed ? <span className="text-sm text-destructive">{t('reportFailed')}</span> : null}
          <Button onClick={submit} disabled={report.isPending || !reason}>
            {t('reportSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
