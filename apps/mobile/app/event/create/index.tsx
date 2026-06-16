import { type CreateEventInput, useCreateEvent } from '@padel/api';
import { useT } from '@padel/i18n';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventProvider, useEventWizard } from '@/components/event/wizard/CreateEventContext';
import { StepIndicator } from '@/components/event/wizard/StepIndicator';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = steps[stepIndex];
  const canAdvance = step ? step.isValid(draft) : false;

  const onClose = () => {
    if (isDirty) {
      Alert.alert(t('discardTitle'), t('discardBody'), [
        { text: t('discardCancel'), style: 'cancel' },
        { text: t('discardConfirm'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const finalize = async () => {
    const { eventType, specification, scoringMode, startsAt } = draft;
    if (!eventType || !specification || !scoringMode || !startsAt) return;

    const input: CreateEventInput = {
      groupId: draft.groupId,
      eventType,
      specification,
      scoringMode,
      scoringValue: draft.scoringValue,
      manualLocationName: draft.manualLocationName,
      manualLocationAddress: draft.manualLocationAddress,
      venueId: draft.venueId,
      locationLat: draft.locationLat,
      locationLng: draft.locationLng,
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
        <Text style={styles.title}>{t('createTitle')}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.close}>{t('close')}</Text>
        </Pressable>
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

      {error ? <Text style={styles.error}>{t(error)}</Text> : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {!isFirst ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            style={[styles.btn, styles.backBtn]}
          >
            <Text style={styles.backLabel}>{t('back')}</Text>
          </Pressable>
        ) : (
          <View style={styles.btnSpacer} />
        )}
        <Pressable
          onPress={onPrimary}
          disabled={!canAdvance || submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdvance || submitting }}
          style={[
            styles.btn,
            styles.primaryBtn,
            (!canAdvance || submitting) && styles.primaryBtnDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryLabel}>{isLast ? t('finish') : t('next')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  close: { fontSize: 16, fontWeight: '600', color: '#0B7BFF' },
  inner: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSpacer: { width: 1 },
  backBtn: { backgroundColor: '#F0F3F8' },
  backLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  primaryBtn: { backgroundColor: '#0B7BFF', marginLeft: 'auto' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  error: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D7263D',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});
