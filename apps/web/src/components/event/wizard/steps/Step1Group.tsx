'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useEventCreatableGroups } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupThumb } from '@/components/group/GroupThumb';
import type { StepProps } from '../types';

/**
 * Group (UX-CEVT-02, B14). The groups of THIS community you may create an event in — web reaches
 * the wizard only from a community, so the list is narrowed to it. A tap on a card IS the answer:
 * it sets the group and advances, leaving no selected state behind (UX-CEVT-01).
 *
 * A group event starts public; Preferences can still make it private.
 */
export function Step1Group({ communityId, advance }: StepProps) {
  const { t } = useT('event');
  const { t: tg } = useT('group');
  const { t: tc } = useT('common');
  const groups = useEventCreatableGroups(communityId);

  if (groups.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (groups.isError) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center" data-testid="event-wizard-groups-error">
        <p className="text-sm text-destructive">{tc('loadError')}</p>
        <Button variant="outline" size="sm" onClick={() => void groups.refetch()}>
          {tc('retry')}
        </Button>
      </div>
    );
  }

  const rows = groups.data ?? [];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('step1Subtitle')}</p>
      {rows.length === 0 ? (
        <GroupEmpty title={t('noGroupsYet')} body={t('step1GroupEmptyBody')} testId="empty-step1-groups" />
      ) : (
        // Full-width list → the horizontal card (UX-GLOB-09).
        <ul className="flex flex-col gap-2">
          {rows.map((g) => (
            <li key={g.group_id}>
              <button
                type="button"
                // A new group starts public; re-picking the one on the draft keeps its privacy
                // (the page's applyPatch).
                onClick={() => advance?.({ groupId: g.group_id })}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-testid={`event-wizard-group-${g.group_id}`}
              >
                <GroupThumb path={g.thumbnail_path} name={g.name} className="size-12 rounded-lg" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{g.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {tg('playersCount', { count: g.member_count })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Group step's fixed bottom area: "Continue without group" as a plain button, the ranking
 * consequence as supporting text under it (not inside it), and a confirmation before it commits.
 * An event without a group is a normal path, so it is always offered — not only with no groups.
 */
export function NoGroupFooter({ advance }: StepProps) {
  const { t } = useT('event');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)} data-testid="event-wizard-no-group">
        {t('noGroupOption')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t('noGroupHint')}</p>
      <GroupConfirm
        open={open}
        onClose={() => setOpen(false)}
        title={t('noGroupSheetTitle')}
        body={t('noGroupSheetBody')}
        confirmLabel={t('noGroupSheetConfirm')}
        cancelLabel={t('noGroupSheetCancel')}
        onConfirm={() => {
          setOpen(false);
          advance?.({ groupId: null });
        }}
      />
    </div>
  );
}
