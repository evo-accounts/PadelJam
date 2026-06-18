import { updateEventSchema, useEvent, useUpdateEvent } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimePicker } from '@/components/event/wizard/DateTimePicker';
import type { EventDraft } from '@/components/event/wizard/draft';
import { Stepper } from '@/components/event/wizard/Stepper';
import { Step4Scoring } from '@/components/event/wizard/steps/Step4Scoring';
import { Step8Preferences } from '@/components/event/wizard/steps/Step8Preferences';

export default function EditEventScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);
  const update = useUpdateEvent(id);

  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the draft once from the event row (covers every field the reused steps read).
  const seeded = useMemo<EventDraft | null>(() => {
    if (!event) return null;
    return {
      groupId: event.group_id,
      eventType: event.event_type,
      specification: event.specification,
      scoringMode: event.scoring_mode,
      scoringValue: event.scoring_value,
      hasLocation: true,
      numCourts: event.num_courts,
      startsAt: event.starts_at,
      durationMinutes: event.duration_minutes,
      allowStandby: event.allow_standby,
      standbySpots: event.standby_spots ?? undefined,
      isPrivate: event.is_private,
      entranceFee: {
        enabled: event.entrance_fee_enabled,
        amount: event.entrance_fee_amount ?? undefined,
        method: event.entrance_fee_method ?? undefined,
        mbaNumber: event.entrance_fee_mba_number ?? undefined,
      },
      playersSubmitResults: event.players_submit_results,
      organizerRole: event.organizer_role,
      name: event.name,
      description: event.description ?? '',
      thumbnailPath: event.thumbnail_path ?? undefined,
    } as EventDraft;
  }, [event]);

  const d = draft ?? seeded;
  const patch = (partial: Partial<EventDraft>) =>
    setDraft((prev) => ({ ...(prev ?? seeded!), ...partial }));

  if (isLoading || !d) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  const onSave = () => {
    const parsed = updateEventSchema.safeParse({
      name: d.name,
      description: d.description?.trim() ? d.description : undefined,
      thumbnailPath: d.thumbnailPath,
      startsAt: d.startsAt,
      durationMinutes: d.durationMinutes,
      scoringMode: d.scoringMode,
      scoringValue: d.scoringValue,
      allowStandby: d.allowStandby,
      standbySpots: d.standbySpots,
      isPrivate: d.isPrivate,
      entranceFee: d.entranceFee,
      playersSubmitResults: d.playersSubmitResults,
      organizerRole: d.organizerRole,
    });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'name_required'));
      return;
    }
    setBusy(true);
    setError(null);
    update
      .mutateAsync({ values: parsed.data, groupId: event!.group_id })
      .then(() => router.back())
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')))
      .finally(() => setBusy(false));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>{t('editTitle')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Details */}
        <Text style={styles.section}>{t('editDetailsSection')}</Text>
        <Text style={styles.label}>{t('editNameLabel')}</Text>
        <TextInput style={styles.input} value={d.name} onChangeText={(name) => patch({ name })} maxLength={80} />
        <Text style={styles.label}>{t('editDescriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={d.description ?? ''}
          onChangeText={(description) => patch({ description })}
          maxLength={500}
          multiline
        />

        {/* Date & time */}
        <Text style={styles.section}>{t('editDateTimeSection')}</Text>
        <DateTimePicker value={d.startsAt} onChange={(startsAt) => patch({ startsAt })} />
        <Stepper
          label={t('durationLabel')}
          value={d.durationMinutes}
          onChange={(durationMinutes) => patch({ durationMinutes })}
          min={30}
          max={240}
          step={15}
        />

        {/* Scoring + Preferences (reused wizard steps) */}
        <Step4Scoring draft={d} patch={patch} />
        <Step8Preferences draft={d} patch={patch} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={onSave}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('saveCta')}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff' },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32, width: 32 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  content: { padding: 16, gap: 16 },
  section: { fontSize: 13, fontWeight: '700', color: '#8A95A5', textTransform: 'uppercase', marginTop: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
  input: { borderWidth: 1, borderColor: '#E6EAF0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0B1F3A', backgroundColor: '#fff' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  error: { color: '#D7263D', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  btn: { minHeight: 50, borderRadius: 12, backgroundColor: '#0B7BFF', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
