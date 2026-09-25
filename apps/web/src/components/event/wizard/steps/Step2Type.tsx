'use client';
import { useT } from '@padel/i18n';
import { EVENT_TYPES } from '@padel/api';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Format (UX-CEVT-03): three cards with their descriptions; the tap sets the format and advances. */
export function Step2Type({ advance }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-2">
      {EVENT_TYPES.map((v) => (
        <SelectableCard
          key={v}
          title={t(`type${cap(v)}Label`)}
          subtitle={t(`type${cap(v)}Desc`)}
          onClick={() => advance?.({ eventType: v })}
          testId={`event-wizard-format-${v}`}
        />
      ))}
    </div>
  );
}
