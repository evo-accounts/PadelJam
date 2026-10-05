'use client';
import { useId, useState, type ReactNode } from 'react';
import { useCommunities } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  COMMUNITY_TYPE_LABEL,
  COMMUNITY_TYPE_OPTIONS,
  EVENT_TYPE_FILTERS,
  EVENT_TYPE_LABEL,
  PRIVACY_LABEL,
  PRIVACY_OPTIONS,
  SEARCH_DISTANCE_STEPS_KM,
  SORT_LABEL,
  toggle,
  type CommunitiesFilterState,
  type EventsFilterState,
  type ExploreSearchTypedTab,
  type GroupsFilterState,
} from '@padel/api';

/**
 * The Filter sheet (UX-EXPL-08) — on web a Radix dialog, as every sheet is (UX-GLOB-02): titled
 * "Filter", ✕ top-right, a body specific to the tab, and one primary "Apply" that applies the
 * form and closes. The form edits a copy; ✕ throws it away.
 */
function FilterFrame({
  open,
  onOpenChange,
  onApply,
  testId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: () => void;
  testId: string;
  children: ReactNode;
}) {
  const { t } = useT('explore');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg" data-testid={testId}>
        <DialogHeader className="border-b px-6 pt-6 pb-4 pr-12">
          <DialogTitle>{t('filterTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('filterDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">{children}</div>
        <div className="border-t px-6 pt-4 pb-6">
          <Button type="button" className="w-full" onClick={onApply} data-testid={`${testId}-apply`}>
            {t('apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string | null; children: ReactNode }) {
  const id = useId();
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </section>
  );
}

/**
 * Chips: pressed = selected. Single-select for Sort, multi for the rest. Drawn on the semantic
 * `primary` / `card` colours rather than Button variants, so selected and unselected stay
 * distinguishable in both themes (the button tokens are light-only).
 */
function Chips<T extends string>({
  options,
  selected,
  label,
  onPress,
  disabled,
  testId,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (v: T) => string;
  onPress: (v: T) => void;
  disabled?: (v: T) => boolean;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((v) => {
        const on = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
              on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted/50',
            )}
            disabled={disabled?.(v)}
            onClick={() => onPress(v)}
            data-testid={`${testId}-${v}`}
          >
            {label(v)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The stepped distance control (D13): 5 / 10 / 25 / 50 / 100 km, and a last stop with no limit.
 * Disabled when the viewer's profile has no point — every row would be dropped (D2).
 */
function Distance({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: number | null;
  onChange: (km: number | null) => void;
  disabled: boolean;
  testId: string;
}) {
  const { t } = useT('explore');
  const id = useId();
  const steps = SEARCH_DISTANCE_STEPS_KM;
  const index = value == null ? steps.length : Math.max(0, steps.indexOf(value as (typeof steps)[number]));
  const text = value == null ? t('distanceAny') : t('distanceUpTo', { km: value });
  return (
    <Section title={t('filterDistance')} hint={disabled ? t('distanceNeedsLocation') : null}>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id} className={cn('text-sm font-normal', disabled && 'text-muted-foreground')}>
          {text}
        </Label>
        <input
          id={id}
          type="range"
          min={0}
          max={steps.length}
          step={1}
          value={index}
          disabled={disabled}
          aria-valuetext={text}
          onChange={(e) => {
            const i = Number(e.target.value);
            onChange(i >= steps.length ? null : (steps[i] ?? null));
          }}
          className="w-full accent-primary disabled:opacity-50"
          data-testid={`${testId}-distance`}
        />
        <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
          {steps.map((km) => (
            <span key={km}>{km}</span>
          ))}
          <span>{t('distanceAnyShort')}</span>
        </div>
      </div>
    </Section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}

function SortChips<S extends keyof typeof SORT_LABEL>({
  options,
  value,
  onChange,
  hasLocation,
  testId,
}: {
  options: readonly S[];
  value: S;
  onChange: (s: S) => void;
  hasLocation: boolean;
  testId: string;
}) {
  const { t } = useT('explore');
  return (
    <Section title={t('filterSort')}>
      <Chips
        options={options}
        selected={[value]}
        label={(s) => t(SORT_LABEL[s])}
        onPress={onChange}
        disabled={(s) => s === 'distance' && !hasLocation}
        testId={`${testId}-sort`}
      />
    </Section>
  );
}

// --- Per-tab bodies ---

function EventsBody({
  draft,
  set,
  hasLocation,
}: {
  draft: EventsFilterState;
  set: (next: EventsFilterState) => void;
  hasLocation: boolean;
}) {
  const { t } = useT('explore');
  const fromId = useId();
  const toId = useId();
  return (
    <>
      <SortChips
        options={['relevant', 'date', 'distance'] as const}
        value={draft.sort}
        onChange={(sort) => set({ ...draft, sort })}
        hasLocation={hasLocation}
        testId="explore-filter-events"
      />
      <Section title={t('filterDate')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fromId} className="text-xs text-muted-foreground">
              {t('dateFrom')}
            </Label>
            <Input
              id={fromId}
              type="date"
              value={draft.dateFrom}
              max={draft.dateTo || undefined}
              onChange={(e) => set({ ...draft, dateFrom: e.target.value })}
              data-testid="explore-filter-events-from"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={toId} className="text-xs text-muted-foreground">
              {t('dateTo')}
            </Label>
            <Input
              id={toId}
              type="date"
              value={draft.dateTo}
              min={draft.dateFrom || undefined}
              onChange={(e) => set({ ...draft, dateTo: e.target.value })}
              data-testid="explore-filter-events-to"
            />
          </div>
        </div>
      </Section>
      <Section title={t('filterType')}>
        <Chips
          options={EVENT_TYPE_FILTERS}
          selected={draft.types}
          label={(v) => t(EVENT_TYPE_LABEL[v])}
          onPress={(v) => set({ ...draft, types: toggle(draft.types, v) })}
          testId="explore-filter-events-type"
        />
      </Section>
      <Distance
        value={hasLocation ? draft.maxKm : null}
        onChange={(maxKm) => set({ ...draft, maxKm })}
        disabled={!hasLocation}
        testId="explore-filter-events"
      />
      <Toggle label={t('filterFree')} checked={draft.free} onChange={(free) => set({ ...draft, free })} testId="explore-filter-events-free" />
      <Toggle
        label={t('filterRecurring')}
        checked={draft.recurring}
        onChange={(recurring) => set({ ...draft, recurring })}
        testId="explore-filter-events-recurring"
      />
    </>
  );
}

function GroupsBody({
  draft,
  set,
  hasLocation,
}: {
  draft: GroupsFilterState;
  set: (next: GroupsFilterState) => void;
  hasLocation: boolean;
}) {
  const { t } = useT('explore');
  const mine = useCommunities();
  const communities = (mine.data ?? []).map((r) => r.community).filter((c) => c && !c.archived_at);
  const names = new Map(communities.map((c) => [c!.id, c!.name]));
  return (
    <>
      <SortChips
        options={['relevant', 'recent', 'distance'] as const}
        value={draft.sort}
        onChange={(sort) => set({ ...draft, sort })}
        hasLocation={hasLocation}
        testId="explore-filter-groups"
      />
      <Section title={t('filterCommunity')} hint={communities.length === 0 && !mine.isLoading ? t('filterCommunityNone') : null}>
        {communities.length > 0 ? (
          <Chips
            options={[...names.keys()]}
            selected={draft.communityIds}
            label={(id) => names.get(id) ?? id}
            onPress={(id) => set({ ...draft, communityIds: toggle(draft.communityIds, id) })}
            testId="explore-filter-groups-community"
          />
        ) : null}
      </Section>
      <Distance
        value={hasLocation ? draft.maxKm : null}
        onChange={(maxKm) => set({ ...draft, maxKm })}
        disabled={!hasLocation}
        testId="explore-filter-groups"
      />
      <Toggle
        label={t('filterWithUpcoming')}
        checked={draft.withUpcoming}
        onChange={(withUpcoming) => set({ ...draft, withUpcoming })}
        testId="explore-filter-groups-upcoming"
      />
    </>
  );
}

function CommunitiesBody({
  draft,
  set,
  hasLocation,
}: {
  draft: CommunitiesFilterState;
  set: (next: CommunitiesFilterState) => void;
  hasLocation: boolean;
}) {
  const { t } = useT('explore');
  return (
    <>
      <SortChips
        options={['relevant', 'recent', 'distance'] as const}
        value={draft.sort}
        onChange={(sort) => set({ ...draft, sort })}
        hasLocation={hasLocation}
        testId="explore-filter-communities"
      />
      <Section title={t('filterType')}>
        <Chips
          options={COMMUNITY_TYPE_OPTIONS}
          selected={draft.types}
          label={(v) => t(COMMUNITY_TYPE_LABEL[v])}
          onPress={(v) => set({ ...draft, types: toggle(draft.types, v) })}
          testId="explore-filter-communities-type"
        />
      </Section>
      <Distance
        value={hasLocation ? draft.maxKm : null}
        onChange={(maxKm) => set({ ...draft, maxKm })}
        disabled={!hasLocation}
        testId="explore-filter-communities"
      />
      <Section title={t('filterPrivacy')}>
        <Chips
          options={PRIVACY_OPTIONS}
          selected={draft.privacy}
          label={(v) => t(PRIVACY_LABEL[v])}
          onPress={(v) => set({ ...draft, privacy: toggle(draft.privacy, v) })}
          testId="explore-filter-communities-privacy"
        />
      </Section>
      <Toggle
        label={t('filterWithUpcoming')}
        checked={draft.withUpcoming}
        onChange={(withUpcoming) => set({ ...draft, withUpcoming })}
        testId="explore-filter-communities-upcoming"
      />
    </>
  );
}

type Bodies = {
  events: EventsFilterState;
  groups: GroupsFilterState;
  communities: CommunitiesFilterState;
};

/**
 * The Filter dialog for one tab. Mount it only while open (the draft is seeded from `value` on
 * mount); Apply hands the draft back and closes.
 */
export function FilterDialog<K extends ExploreSearchTypedTab>({
  tab,
  value,
  hasLocation,
  onApply,
  onClose,
}: {
  tab: K;
  value: Bodies[K];
  hasLocation: boolean;
  onApply: (next: Bodies[K]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Bodies[K]>(value);
  const set = setDraft as (next: Bodies[ExploreSearchTypedTab]) => void;
  return (
    <FilterFrame
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onApply={() => onApply(draft)}
      testId={`explore-filter-${tab}`}
    >
      {tab === 'events' ? (
        <EventsBody draft={draft as EventsFilterState} set={set} hasLocation={hasLocation} />
      ) : tab === 'groups' ? (
        <GroupsBody draft={draft as GroupsFilterState} set={set} hasLocation={hasLocation} />
      ) : (
        <CommunitiesBody draft={draft as CommunitiesFilterState} set={set} hasLocation={hasLocation} />
      )}
    </FilterFrame>
  );
}
