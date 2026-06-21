'use client';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { StepProps } from '../types';

export function Step6Courts({ draft, patch }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('step6Title')}</h2>
      <div className="space-y-2">
        <Label>{t('courtsLabel')}</Label>
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            disabled={draft.numCourts <= 1}
            onClick={() => patch({ numCourts: Math.max(1, draft.numCourts - 1) })}
          >
            &minus;
          </Button>
          <span className="w-8 text-center text-lg font-medium">{draft.numCourts}</span>
          <Button variant="outline" size="icon" onClick={() => patch({ numCourts: draft.numCourts + 1 })}>
            +
          </Button>
        </div>
      </div>
    </div>
  );
}
