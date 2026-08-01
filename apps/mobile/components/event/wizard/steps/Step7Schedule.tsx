import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { DateTimePicker } from '../DateTimePicker';
import type { EventDraft, WizardStepProps } from '../draft';
import { Stepper } from '../Stepper';
import { colors, palette } from '../../../../theme';

const LEAD_OPTIONS = [3, 5, 7] as const;
type LeadDays = (typeof LEAD_OPTIONS)[number];

function deriveSeries(draft: EventDraft, leadDays: LeadDays): EventDraft['series'] {
  if (!draft.startsAt) return undefined;
  const d = new Date(draft.startsAt);
  if (Number.isNaN(d.getTime())) return undefined;
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  const startTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    dayOfWeek: dow,
    startTime,
    durationMinutes: draft.durationMinutes,
    inviteLeadDays: leadDays,
  };
}

export function Step7Schedule({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  const repeatOn = draft.series != null;
  const leadDays: LeadDays = draft.series?.inviteLeadDays ?? 5;

  const onStartsAtChange = (iso: string) => {
    if (repeatOn) {
      patch({ startsAt: iso, series: deriveSeries({ ...draft, startsAt: iso }, leadDays) });
    } else {
      patch({ startsAt: iso });
    }
  };

  const onDurationChange = (n: number) => {
    const next = { ...draft, durationMinutes: n };
    if (repeatOn) {
      patch({ durationMinutes: n, series: deriveSeries(next, leadDays) });
    } else {
      patch({ durationMinutes: n });
    }
  };

  const onRepeatToggle = (on: boolean) => {
    if (on) {
      patch({ series: deriveSeries(draft, leadDays) });
    } else {
      patch({ series: undefined });
    }
  };

  const onLeadChange = (lead: LeadDays) => {
    patch({ series: deriveSeries(draft, lead) });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step7Title')}</Text>

      <DateTimePicker value={draft.startsAt} onChange={onStartsAtChange} />

      <Stepper
        label={t('durationLabel')}
        value={draft.durationMinutes}
        onChange={onDurationChange}
        min={30}
        max={240}
        step={15}
      />

      {draft.groupId ? (
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>{t('repeatLabel')}</Text>
              <Text style={styles.hint}>{t('repeatHint')}</Text>
            </View>
            <Switch value={repeatOn} onValueChange={onRepeatToggle} />
          </View>

          {repeatOn ? (
            <View style={styles.section}>
              <Text style={styles.label}>{t('inviteLeadLabel')}</Text>
              <View style={styles.chipRow}>
                {LEAD_OPTIONS.map((lead) => {
                  const selected = leadDays === lead;
                  return (
                    <Pressable
                      key={lead}
                      onPress={() => onLeadChange(lead)}
                      style={[styles.chip, selected && styles.chipSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {lead}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  section: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  hint: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { flex: 1 },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: {
    minWidth: 56,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  chipText: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  chipTextSelected: { color: colors.primary },
});
