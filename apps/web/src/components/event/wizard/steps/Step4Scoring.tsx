'use client';
import { useT } from '@padel/i18n';
import { SCORING_MODES } from '@padel/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Step4Scoring({ draft, patch }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('step4Title')}</h2>
      <div className="flex flex-col gap-2">
        {SCORING_MODES.map((v) => (
          <SelectableCard
            key={v}
            title={t(`scoring${cap(v)}Label`)}
            selected={draft.scoringMode === v}
            onClick={() => patch({ scoringMode: v })}
          />
        ))}
      </div>
      {draft.scoringMode && draft.scoringMode !== 'classic' ? (
        <div className="space-y-2">
          <Label>{t('scoringValueLabel')}</Label>
          <Input
            type="number"
            value={draft.scoringValue ?? ''}
            onChange={(e) => patch({ scoringValue: Number(e.target.value) || null })}
          />
        </div>
      ) : null}
    </div>
  );
}
