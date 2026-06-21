'use client';
import { useT } from '@padel/i18n';
import { EVENT_TYPES } from '@padel/api';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Step2Type({ draft, patch }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('step2Title')}</h2>
      <div className="flex flex-col gap-2">
        {EVENT_TYPES.map((v) => (
          <SelectableCard
            key={v}
            title={t(`type${cap(v)}Label`)}
            selected={draft.eventType === v}
            onClick={() => patch({ eventType: v })}
          />
        ))}
      </div>
    </div>
  );
}
