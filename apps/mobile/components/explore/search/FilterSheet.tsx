/**
 * The Filter sheet (UX-EXPL-08): a bottom sheet (UX-GLOB-02) titled "Filter" with ✕ top-right, a
 * body specific to the active tab, and one primary Apply that applies the form and closes. The form
 * edits a copy; ✕ (or the backdrop) throws it away. The same bodies as web's `FilterDialog`:
 *
 * - Events: Sort (Most relevant / Date / Distance), Date From–To, the nine Type chips (D4),
 *   Distance, Free event, Recurring.
 * - Groups: Sort (Most relevant / Recently created / Distance), Community (the viewer's own),
 *   Distance, With upcoming events. No Privacy (D1).
 * - Communities: Sort, Type (Club / Team / Group of friends), Distance, Privacy, With upcoming
 *   events.
 *
 * Distance — the control and the Distance sort — is disabled with a hint when the viewer's profile
 * has no point (D2).
 */
import { useCommunities } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BottomSheet, Button, Chip, DateField, IconButton, SwitchRow, Text } from '@/components/ui';
import { space } from '../../../theme';
import { DistanceSlider } from './DistanceSlider';
import {
  COMMUNITY_TYPE_LABEL,
  COMMUNITY_TYPE_OPTIONS,
  EVENT_TYPE_FILTERS,
  EVENT_TYPE_LABEL,
  localDay,
  PRIVACY_LABEL,
  PRIVACY_OPTIONS,
  SORT_LABEL,
  toggle,
  type CommunitiesFilterState,
  type EventsFilterState,
  type ExploreSearchTypedTab,
  type GroupsFilterState,
} from './searchFilters';

type Bodies = {
  events: EventsFilterState;
  groups: GroupsFilterState;
  communities: CommunitiesFilterState;
};

function Section({ title, hint, children }: { title: string; hint?: string | null; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" accessibilityRole="header">
        {title}
      </Text>
      {children}
      {hint ? (
        <Text variant="hint" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Chips: selected = pressed. Single-select for Sort, multi for the rest. */
function Chips<T extends string>({
  options,
  selected,
  label,
  onPress,
  disabled,
  testID,
}: {
  options: readonly T[];
  selected: readonly T[];
  label: (v: T) => string;
  onPress: (v: T) => void;
  disabled?: (v: T) => boolean;
  testID: string;
}) {
  return (
    <View style={styles.chips}>
      {options.map((v) => (
        <Chip
          key={v}
          label={label(v)}
          selected={selected.includes(v)}
          disabled={disabled?.(v)}
          onPress={() => onPress(v)}
          testID={`${testID}-${v}`}
        />
      ))}
    </View>
  );
}

function SortChips<S extends keyof typeof SORT_LABEL>({
  options,
  value,
  onChange,
  hasLocation,
  testID,
}: {
  options: readonly S[];
  value: S;
  onChange: (s: S) => void;
  hasLocation: boolean;
  testID: string;
}) {
  const { t } = useT('discovery');
  return (
    <Section title={t('filterSort')}>
      <Chips
        options={options}
        selected={[value]}
        label={(s) => t(SORT_LABEL[s])}
        onPress={onChange}
        disabled={(s) => s === 'distance' && !hasLocation}
        testID={`${testID}-sort`}
      />
    </Section>
  );
}

function Distance({
  value,
  onChange,
  hasLocation,
  testID,
}: {
  value: number | null;
  onChange: (km: number | null) => void;
  hasLocation: boolean;
  testID: string;
}) {
  const { t } = useT('discovery');
  return (
    <Section title={t('filterDistance')} hint={hasLocation ? null : t('distanceNeedsLocation')}>
      <DistanceSlider
        value={hasLocation ? value : null}
        onChange={onChange}
        disabled={!hasLocation}
        testID={`${testID}-distance`}
      />
    </Section>
  );
}

/** One end of the date range: the picker, and a ✕ to clear it once set. */
function DateEnd({
  label,
  value,
  onChange,
  minimumDate,
  testID,
}: {
  label: string;
  value: string;
  onChange: (day: string) => void;
  minimumDate: Date;
  testID: string;
}) {
  const { t, i18n } = useT('discovery');
  return (
    <View style={styles.dateEnd}>
      <View style={styles.flex}>
        <DateField
          label={label}
          value={value || null}
          displayValue={value ? localDay(value).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : undefined}
          onChange={onChange}
          placeholder={t('datePlaceholder')}
          confirmLabel={t('dateDone')}
          minimumDate={minimumDate}
          maximumDate={null}
          testID={testID}
        />
      </View>
      {value ? (
        <IconButton
          icon="✕"
          size="sm"
          accessibilityLabel={t('dateClear', { label })}
          onPress={() => onChange('')}
          testID={`${testID}-clear`}
        />
      ) : null}
    </View>
  );
}

function EventsBody({
  draft,
  set,
  hasLocation,
}: {
  draft: EventsFilterState;
  set: (next: EventsFilterState) => void;
  hasLocation: boolean;
}) {
  const { t } = useT('discovery');
  // Only upcoming events are searchable, so the pickers start at today.
  const [today] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  return (
    <>
      <SortChips
        options={['relevant', 'date', 'distance'] as const}
        value={draft.sort}
        onChange={(sort) => set({ ...draft, sort })}
        hasLocation={hasLocation}
        testID="explore-filter-events"
      />
      <Section title={t('filterDate')}>
        <View style={styles.dates}>
          <DateEnd
            label={t('dateFrom')}
            value={draft.dateFrom}
            // "To" before "From" would match nothing: picking a later From pulls To along.
            onChange={(dateFrom) =>
              set({ ...draft, dateFrom, dateTo: draft.dateTo && dateFrom > draft.dateTo ? dateFrom : draft.dateTo })
            }
            minimumDate={today}
            testID="explore-filter-events-from"
          />
          <DateEnd
            label={t('dateTo')}
            value={draft.dateTo}
            onChange={(dateTo) => set({ ...draft, dateTo })}
            minimumDate={draft.dateFrom ? localDay(draft.dateFrom) : today}
            testID="explore-filter-events-to"
          />
        </View>
      </Section>
      <Section title={t('filterType')}>
        <Chips
          options={EVENT_TYPE_FILTERS}
          selected={draft.types}
          label={(v) => t(EVENT_TYPE_LABEL[v])}
          onPress={(v) => set({ ...draft, types: toggle(draft.types, v) })}
          testID="explore-filter-events-type"
        />
      </Section>
      <Distance
        value={draft.maxKm}
        onChange={(maxKm) => set({ ...draft, maxKm })}
        hasLocation={hasLocation}
        testID="explore-filter-events"
      />
      <SwitchRow
        label={t('filterFree')}
        value={draft.free}
        onValueChange={(free) => set({ ...draft, free })}
        testID="explore-filter-events-free"
      />
      <SwitchRow
        label={t('filterRecurring')}
        value={draft.recurring}
        onValueChange={(recurring) => set({ ...draft, recurring })}
        testID="explore-filter-events-recurring"
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
  const { t } = useT('discovery');
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
        testID="explore-filter-groups"
      />
      <Section
        title={t('filterCommunity')}
        hint={communities.length === 0 && !mine.isLoading ? t('filterCommunityNone') : null}
      >
        {communities.length > 0 ? (
          <Chips
            options={[...names.keys()]}
            selected={draft.communityIds}
            label={(id) => names.get(id) ?? id}
            onPress={(id) => set({ ...draft, communityIds: toggle(draft.communityIds, id) })}
            testID="explore-filter-groups-community"
          />
        ) : null}
      </Section>
      <Distance
        value={draft.maxKm}
        onChange={(maxKm) => set({ ...draft, maxKm })}
        hasLocation={hasLocation}
        testID="explore-filter-groups"
      />
      <SwitchRow
        label={t('filterWithUpcoming')}
        value={draft.withUpcoming}
        onValueChange={(withUpcoming) => set({ ...draft, withUpcoming })}
        testID="explore-filter-groups-upcoming"
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
  const { t } = useT('discovery');
  return (
    <>
      <SortChips
        options={['relevant', 'recent', 'distance'] as const}
        value={draft.sort}
        onChange={(sort) => set({ ...draft, sort })}
        hasLocation={hasLocation}
        testID="explore-filter-communities"
      />
      <Section title={t('filterType')}>
        <Chips
          options={COMMUNITY_TYPE_OPTIONS}
          selected={draft.types}
          label={(v) => t(COMMUNITY_TYPE_LABEL[v])}
          onPress={(v) => set({ ...draft, types: toggle(draft.types, v) })}
          testID="explore-filter-communities-type"
        />
      </Section>
      <Distance
        value={draft.maxKm}
        onChange={(maxKm) => set({ ...draft, maxKm })}
        hasLocation={hasLocation}
        testID="explore-filter-communities"
      />
      <Section title={t('filterPrivacy')}>
        <Chips
          options={PRIVACY_OPTIONS}
          selected={draft.privacy}
          label={(v) => t(PRIVACY_LABEL[v])}
          onPress={(v) => set({ ...draft, privacy: toggle(draft.privacy, v) })}
          testID="explore-filter-communities-privacy"
        />
      </Section>
      <SwitchRow
        label={t('filterWithUpcoming')}
        value={draft.withUpcoming}
        onValueChange={(withUpcoming) => set({ ...draft, withUpcoming })}
        testID="explore-filter-communities-upcoming"
      />
    </>
  );
}

/**
 * The Filter sheet for one tab. Mount it only while open: the draft is seeded from `value` on
 * mount, and Apply hands it back.
 */
export function FilterSheet<K extends ExploreSearchTypedTab>({
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
  const { t } = useT('discovery');
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<Bodies[K]>(value);
  const set = setDraft as (next: Bodies[ExploreSearchTypedTab]) => void;
  return (
    <BottomSheet visible onClose={onClose} title={t('filterTitle')} testID={`explore-filter-${tab}`}>
      <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {tab === 'events' ? (
          <EventsBody draft={draft as EventsFilterState} set={set} hasLocation={hasLocation} />
        ) : tab === 'groups' ? (
          <GroupsBody draft={draft as GroupsFilterState} set={set} hasLocation={hasLocation} />
        ) : (
          <CommunitiesBody draft={draft as CommunitiesFilterState} set={set} hasLocation={hasLocation} />
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button fullWidth label={t('apply')} onPress={() => onApply(draft)} testID={`explore-filter-${tab}-apply`} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: space[6], paddingHorizontal: space[2], paddingBottom: space[4] },
  section: { gap: space[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  dates: { flexDirection: 'row', gap: space[3] },
  dateEnd: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
  footer: { paddingHorizontal: space[2], paddingTop: space[3] },
});
