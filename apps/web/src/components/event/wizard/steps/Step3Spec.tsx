'use client';
import { useT } from '@padel/i18n';
import { SPECIFICATIONS } from '@padel/api';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Step3Spec({ draft, patch }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('step3Title')}</h2>
      <div className="flex flex-col gap-2">
        {SPECIFICATIONS.map((v) => (
          <SelectableCard
            key={v}
            title={t(`spec${cap(v)}Label`)}
            selected={draft.specification === v}
            onClick={() => patch({ specification: v })}
          />
        ))}
      </div>
    </div>
  );
}
