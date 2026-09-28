'use client';
import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface ScoreDialogMatch {
  id: string;
  side_a_score: number | null;
  side_b_score: number | null;
  status: string;
}

interface ScoreDialogProps {
  match: ScoreDialogMatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (vals: { sideA: number; sideB: number; notPlayed: boolean }) => void;
  submitting: boolean;
}

/** Coerce free-typed input to a non-negative integer (HTML min isn't enforced on keyboard entry). */
const toScore = (raw: string): number => {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function ScoreDialog({ match, open, onOpenChange, onSubmit, submitting }: ScoreDialogProps) {
  const { t } = useT('event');
  const [sideA, setSideA] = useState(0);
  const [sideB, setSideB] = useState(0);
  const [notPlayed, setNotPlayed] = useState(false);

  useEffect(() => {
    setSideA(match?.side_a_score ?? 0);
    setSideB(match?.side_b_score ?? 0);
    setNotPlayed(match?.status === 'not_played');
  }, [match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('enterScoreTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="score-side-a">{t('sideALabel')}</Label>
              <Input
                id="score-side-a"
                type="number"
                min={0}
                value={sideA}
                onChange={(e) => setSideA(toScore(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="score-side-b">{t('sideBLabel')}</Label>
              <Input
                id="score-side-b"
                type="number"
                min={0}
                value={sideB}
                onChange={(e) => setSideB(toScore(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="score-not-played" checked={notPlayed} onCheckedChange={setNotPlayed} />
            <Label htmlFor="score-not-played">{t('notPlayedToggle')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button disabled={submitting} onClick={() => onSubmit({ sideA, sideB, notPlayed })}>
            {t('saveScoreCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
