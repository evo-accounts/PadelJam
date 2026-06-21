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

const REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;

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

  const submit = () => {
    if (!reason) return;
    report.mutate(
      { targetId, reason, description: description || undefined },
      {
        onSuccess: () => {
          setReason('');
          setDescription('');
          onOpenChange(false);
        },
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
        <DialogFooter>
          <Button onClick={submit} disabled={report.isPending || !reason}>
            {t('reportSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
