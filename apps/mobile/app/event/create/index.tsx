import { type CreateEventInput, useCreateEvent } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { geocodeQuery } from '@padel/utils';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventProvider, useEventWizard } from '@/components/event/wizard/CreateEventContext';
import { StepIndicator } from '@/components/event/wizard/StepIndicator';
import { geocodeAddress } from '@/lib/geocode';
import { uploadCommunityImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { Button, Text, useConfirm } from '../../../components/ui';
import { colors } from '../../../theme';

export default function CreateEventScreen() {
  const { groupId, communityId } = useLocalSearchParams<{
    groupId?: string;
    communityId?: string;
  }>();
  return (
    <CreateEventProvider initialGroupId={groupId ?? null} communityId={communityId}>
      <CreateEventWizard />
    </CreateEventProvider>
  );
}

function CreateEventWizard() {
  const { t } = useT('event');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, patch, stepIndex, goNext, goBack, steps, isFirst, isLast, isDirty } =
    useEventWizard();
  const create = useCreateEvent();
  const uid = useSession().session?.user.id;
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[stepIndex];
  const canAdvance = step ? step.isValid(draft) : false;

  const onClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: t('discardTitle'),
        body: t('discardBody'),
        confirmLabel: t('discardConfirm'),
        cancelLabel: t('discardCancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  };

  const finalize = async () => {
    const { eventType, specification, scoringMode, startsAt } = draft;
    if (!eventType || !specification || !scoringMode || !startsAt) return;

    let thumbnailPath = draft.thumbnailPath;
    if (draft.thumbnail && uid) {
      try {
        thumbnailPath = await uploadCommunityImage(
          supabase,
          'event-thumbnails',
          uid,
          draft.thumbnail.uri,
          draft.thumbnail.mimeType,
        );
      } catch {
        setError('unknown_error');
        return;
      }
    }

    let { locationLat, locationLng } = draft;
    if (locationLat == null && locationLng == null) {
      const q = geocodeQuery({ name: draft.manualLocationName, address: draft.manualLocationAddress });
      if (q) { const r = await geocodeAddress(q); if (r) { locationLat = r.lat; locationLng = r.lng; } }
    }

    const input: CreateEventInput = {
      groupId: draft.groupId,
      eventType,
      specification,
      scoringMode,
      scoringValue: draft.scoringValue,
      manualLocationName: draft.manualLocationName,
      manualLocationAddress: draft.manualLocationAddress,
      venueId: draft.venueId,
      locationLat,
      locationLng,
      hasLocation: draft.hasLocation,
      numCourts: draft.numCourts,
      startsAt,
      durationMinutes: draft.durationMinutes,
      allowStandby: draft.allowStandby,
      standbySpots: draft.standbySpots,
      isPrivate: draft.isPrivate,
      entranceFee: draft.entranceFee,
      playersSubmitResults: draft.playersSubmitResults,
      organizerRole: draft.organizerRole,
      name: draft.name,
      description: draft.description,
      thumbnailPath,
      series: draft.series,
      invitees: draft.invitees,
      courtIds: draft.courtIds,
    };

    setSubmitting(true);
    setError(null);
    try {
      await create.mutateAsync(input);
      // TODO(Phase 6): route to /event/${id} once the detail screen exists
      if (input.groupId) {
        router.replace(`/group/${input.groupId}` as Href);
      } else {
        router.back();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
      setSubmitting(false);
    }
  };

  const onPrimary = () => {
    if (isLast) {
      void finalize();
      return;
    }
    goNext();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="heading" tone="default">
          {t('createTitle')}
        </Text>
        <Button variant="ghost" size="sm" label={t('close')} onPress={onClose} />
      </View>

      <StepIndicator stepIndex={stepIndex} total={steps.length} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          {step ? <step.Component draft={draft} patch={patch} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {error ? (
        <Text variant="label" tone="destructive" style={styles.error}>
          {t(error)}
        </Text>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {!isFirst ? (
          <Button variant="secondary" label={t('back')} onPress={goBack} />
        ) : (
          <View style={styles.btnSpacer} />
        )}
        {/* `submitting ? <ActivityIndicator/> : <Text/>` was `loading` written
            longhand — the same shape found twelve times across auth. The
            compound `disabled` splits back into its two real reasons. */}
        <Button
          label={isLast ? t('finish') : t('next')}
          onPress={onPrimary}
          loading={submitting}
          disabled={!canAdvance}
          style={styles.primaryBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  inner: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  btnSpacer: { width: 1 },
  // All that is left is the alignment; Button owns the rest.
  primaryBtn: { marginLeft: 'auto' },
  error: { paddingHorizontal: 20, paddingBottom: 8 },
});
