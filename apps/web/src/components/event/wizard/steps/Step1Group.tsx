'use client';
import { useT } from '@padel/i18n';
import { useCommunityGroups } from '@padel/api';
import { SelectableCard } from '../SelectableCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { StepProps } from '../types';

export function Step1Group({ draft, patch, communityId }: StepProps) {
  const { t } = useT('event');
  const groups = useCommunityGroups(communityId);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t('step1Title')}</h2>
        <p className="text-sm text-muted-foreground">{t('step1Subtitle')}</p>
      </div>
      {groups.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="flex flex-col gap-2">
          {(groups.data ?? []).map((g) => (
            <SelectableCard
              key={g.id}
              title={g.name}
              selected={draft.groupId === g.id}
              onClick={() => patch({ groupId: g.id })}
            />
          ))}
          <SelectableCard
            title={t('noGroupOption')}
            subtitle={t('noGroupHint')}
            selected={draft.groupId === null}
            onClick={() => patch({ groupId: null, isPrivate: true })}
          />
        </div>
      )}
    </div>
  );
}
