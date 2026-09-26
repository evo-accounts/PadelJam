'use client';
import { useT } from '@padel/i18n';
import { SPECIFICATIONS } from '@padel/api';
import { Badge } from '@/components/ui/badge';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Players (UX-CEVT-04): the format chosen on the previous step as a read-only chip, so the
 * organizer keeps the context, then Classic / Mixed / Team; the tap sets it and advances.
 * Neither can change once the event exists (UX-LIVE-20).
 */
export function Step3Spec({ draft, advance }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-4">
      {draft.eventType ? (
        <Badge variant="secondary" data-testid="event-wizard-format-chip">
          {t(`type${cap(draft.eventType)}Label`)}
        </Badge>
      ) : null}
      <div className="flex flex-col gap-2">
        {SPECIFICATIONS.map((v) => (
          <SelectableCard
            key={v}
            title={t(`spec${cap(v)}Label`)}
            subtitle={t(`spec${cap(v)}Desc`)}
            onClick={() => advance?.({ specification: v })}
            testId={`event-wizard-players-${v}`}
          />
        ))}
      </div>
    </div>
  );
}
