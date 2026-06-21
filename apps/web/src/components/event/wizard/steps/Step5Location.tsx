'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useSearchVenues } from '@padel/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

export function Step5Location({ draft, patch }: StepProps) {
  const { t } = useT('event');
  const [query, setQuery] = useState('');
  const venues = useSearchVenues(query);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('step5Title')}</h2>
      <div className="space-y-2">
        <Label>{t('venueSearchLabel')}</Label>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} />
        {query.trim() && (venues.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noVenueResults')}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {(venues.data ?? []).map((v) => (
            <SelectableCard
              key={v.id}
              title={v.name}
              subtitle={v.address ?? undefined}
              selected={draft.venueId === v.id}
              onClick={() =>
                patch({
                  venueId: v.id,
                  hasLocation: true,
                  manualLocationName: undefined,
                  manualLocationAddress: undefined,
                })
              }
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('manualLocationLabel')}</Label>
        <Input
          placeholder={t('locationNameLabel')}
          value={draft.manualLocationName ?? ''}
          onChange={(e) =>
            patch({
              manualLocationName: e.target.value,
              venueId: undefined,
              hasLocation: e.target.value.trim().length > 0,
            })
          }
        />
        <Input
          placeholder={t('locationAddressLabel')}
          value={draft.manualLocationAddress ?? ''}
          onChange={(e) => patch({ manualLocationAddress: e.target.value })}
        />
      </div>
    </div>
  );
}
