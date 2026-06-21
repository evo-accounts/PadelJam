'use client';
import { useT } from '@padel/i18n';
import { cn } from '@/lib/utils';

interface Season {
  id: string;
  season_number: number;
  ended_at: string | null;
}

interface SeasonsListProps {
  seasons: Season[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function SeasonsList({ seasons, selectedId, onSelect }: SeasonsListProps) {
  const { t } = useT('group');
  return (
    <ul className="flex flex-col">
      {seasons.map((s) => {
        const label = s.ended_at === null ? t('currentSeason') : t('season', { n: s.season_number });
        const selected = s.id === selectedId;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                selected && 'bg-muted font-medium',
              )}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
