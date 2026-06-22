'use client';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';

interface RoundSelectorProps {
  rounds: { id: string; round_number: number }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RoundSelector({ rounds, selectedId, onSelect }: RoundSelectorProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-wrap gap-2">
      {rounds.map((r) => (
        <Button
          key={r.id}
          size="sm"
          variant={selectedId === r.id ? 'default' : 'outline'}
          onClick={() => onSelect(r.id)}
        >
          {t('roundLabel', { n: r.round_number })}
        </Button>
      ))}
    </div>
  );
}
