import { updateEventSchema, useEvent, useUpdateEvent } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { geocodeQuery } from '@padel/utils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { DateTimePicker } from '@/components/event/wizard/DateTimePicker';
import type { EventDraft } from '@/components/event/wizard/draft';
import { Stepper } from '@/components/event/wizard/Stepper';
import { Step4Scoring } from '@/components/event/wizard/steps/Step4Scoring';
import { Step5Location } from '@/components/event/wizard/steps/Step5Location';
import { Step6Courts } from '@/components/event/wizard/steps/Step6Courts';
import { Step8Preferences } from '@/components/event/wizard/steps/Step8Preferences';
import { geocodeAddress } from '@/lib/geocode';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useDirty } from '@/lib/useDirty';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors, palette } from '../../../theme';
import { Button, Field, Screen, Text, TopBar, useBanner } from '../../../components/ui';

type EditEventFieldKey = 'name';

/** Pure: the name is the only required field owned directly by this screen. */
function validateEditEvent(values: { name: string }): Partial<Record<EditEventFieldKey, string>> {
  return values.name.trim() ? {} : { name: 'name_required' };
}

export default function EditEventScreen() {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);
  const update = useUpdateEvent(id);

  const uid = useSession().session?.user.id;
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<EditEventFieldKey>();
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
      hasLocation: event.has_location,
      venueId: event.venue_id ?? undefined,
      manualLocationName: event.manual_location_name ?? undefined,
      manualLocationAddress: event.manual_location_address ?? undefined,
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

  const dirty =
    useDirty((d ?? {}) as Record<string, unknown>, (seeded ?? {}) as Record<string, unknown>) ||
    picked != null;

  if (isLoading || !d) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const existingThumbUrl = d.thumbnailPath
    ? supabase.storage.from('event-thumbnails').getPublicUrl(d.thumbnailPath).data.publicUrl
    : null;
  const onPickThumbnail = () => {
    void (async () => {
      try {
        const result = await pickAndValidateImage();
        if (result) setPicked(result);
      } catch (e) {
        banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
      }
    })();
  };

  const onSave = () => {
    const errors = validateEditEvent({ name: d.name });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      banner.show(tc('missingInformation'));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    void (async () => {
      try {
        let thumbnailPath = d.thumbnailPath;
        if (picked && uid) {
          thumbnailPath = await uploadCommunityImage(supabase, 'event-thumbnails', uid, picked.uri, picked.mimeType);
        }
        let lat = d.locationLat, lng = d.locationLng;
        // Only geocode a manual address. A venue event keeps its stored coords: location_point isn't
        // readable back as lat/lng, so re-geocoding the venue name here would clobber it (update_event
        // preserves location_point when no coords are sent).
        if (lat == null && lng == null && d.venueId == null) {
          const q = geocodeQuery({ name: d.manualLocationName, address: d.manualLocationAddress });
          if (q) { const r = await geocodeAddress(q); if (r) { lat = r.lat; lng = r.lng; } }
        }
        const parsed = updateEventSchema.safeParse({
          name: d.name,
          description: d.description?.trim() ? d.description : undefined,
          thumbnailPath,
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
          hasLocation: d.hasLocation,
          numCourts: d.numCourts,
          venueId: d.venueId,
          manualLocationName: d.manualLocationName,
          manualLocationAddress: d.manualLocationAddress,
          locationLat: lat,
          locationLng: lng,
        });
        if (!parsed.success) {
          banner.show(t(parsed.error.issues[0]?.message ?? 'name_required'));
          return;
        }
        await update.mutateAsync({ values: parsed.data, groupId: event!.group_id });
        router.back();
      } catch (e) {
        banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('editTitle')} onClose={() => router.back()} dirty={dirty} />

      <Screen scroll padded={false} style={styles.content}>
        {/* Details */}
        <Text variant="label" tone="muted" style={styles.section}>{t('editDetailsSection')}</Text>
        <Field
          label={t('editNameLabel')}
          value={d.name}
          onChangeText={(name) => { patch({ name }); clearFieldError('name'); }}
          maxLength={80}
          error={fieldErrors.name ? tc('required') : undefined}
        />
        <Field
          label={t('editDescriptionLabel')}
          value={d.description ?? ''}
          onChangeText={(description) => patch({ description })}
          maxLength={500}
          multiline
        />

        {/* Date & time */}
        <Text variant="label" tone="muted" style={styles.section}>{t('editDateTimeSection')}</Text>
        <DateTimePicker value={d.startsAt} onChange={(startsAt) => patch({ startsAt })} />
        <Stepper
          label={t('durationLabel')}
          value={d.durationMinutes}
          onChange={(durationMinutes) => patch({ durationMinutes })}
          min={30}
          max={240}
          step={15}
        />

        {/* Scoring + Preferences (reused wizard steps). The wizard titles its steps
            itself now (UX-CEVT-01), so the steps carry no heading of their own. */}
        <Text variant="label" tone="muted" style={styles.section}>{t('scoringLabel')}</Text>
        <Step4Scoring draft={d} patch={patch} />
        <Text variant="label" tone="muted" style={styles.section}>{t('step8Title')}</Text>
        <Step8Preferences draft={d} patch={patch} />

        {/* Location */}
        <Text variant="label" tone="muted" style={styles.section}>{t('editLocationSection')}</Text>
        <Step5Location draft={d} patch={patch} />

        {/* Courts */}
        <Text variant="label" tone="muted" style={styles.section}>{t('editCourtsSection')}</Text>
        <Step6Courts draft={d} patch={patch} />

        {/* Thumbnail */}
        <Text variant="label" tone="muted" style={styles.section}>{t('editThumbnailSection')}</Text>
        <ImagePickerRow
          label={t('editThumbnailLabel')}
          variant="cover"
          uri={picked?.uri ?? existingThumbUrl}
          onPress={onPickThumbnail}
          disabled={busy}
        />

        <Button label={t('saveCta')} loading={busy} fullWidth onPress={onSave} />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16 },
  section: { fontSize: 13, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase', marginTop: 8 },
});
