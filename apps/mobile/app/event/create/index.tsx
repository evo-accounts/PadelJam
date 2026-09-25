import { type CreateEventInput, useCreateEvent } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { geocodeQuery } from '@padel/utils';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { CreateEventProvider, useEventWizard } from '@/components/event/wizard/CreateEventContext';
import { geocodeAddress } from '@/lib/geocode';
import { uploadCommunityImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { Button, ProgressBar, Text, TopBar, useBanner, useConfirm } from '../../../components/ui';
import { colors, space } from '../../../theme';

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
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, patch, step, progress, goNext, goBack, isFirst, isLast, isDirty, communityId } =
    useEventWizard();
  const create = useCreateEvent();
  const uid = useSession().session?.user.id;
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // A step's failing fields are only shown after a Next tap on that step; moving
  // to a new step (forward, back, or by a tap) clears them until the next tap.
  const back = () => {
    setStepErrors([]);
    goBack();
  };
  const advance = (partial?: Parameters<typeof goNext>[0]) => {
    setStepErrors([]);
    goNext(partial);
  };

  // Drops one flagged field as the user corrects it, so it turns back to
  // normal without waiting for the next Next tap (UX-GLOB-06).
  const clearStepError = useCallback((key: string) => {
    setStepErrors((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev));
  }, []);

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
        banner.show(t('unknown_error'));
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
    try {
      await create.mutateAsync(input);
      // TODO(Phase 6): route to /event/${id} once the detail screen exists
      if (input.groupId) {
        router.replace(`/group/${input.groupId}` as Href);
      } else {
        router.back();
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'recurring_events' && communityId) {
        // create_event already requires is_community_admin for a group event, so
        // whoever reaches this wizard can act on the community's plan — see
        // UpgradePrompt.
        setShowUpgrade(true);
        setSubmitting(false);
        return;
      }
      banner.show(t(code));
      setSubmitting(false);
    }
  };

  // Validate on tap, never a disabled button (UX-GLOB-06). The last VISIBLE step
  // validates too before it finalises — with Invite players skipped, that is Details,
  // whose name is required.
  const onPrimary = () => {
    const failing = step.validate(draft);
    if (failing.length) {
      setStepErrors(failing);
      banner.show(tc('missingInformation'));
      return;
    }
    setStepErrors([]);
    if (isLast) {
      void finalize();
      return;
    }
    advance();
  };

  const stepProps = {
    draft,
    patch,
    advance,
    errors: stepErrors,
    clearError: clearStepError,
  };
  const Footer = step.Footer;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        variant="wizard"
        title={t('createTitle')}
        onBack={isFirst ? undefined : back}
        onClose={onClose}
        testID="event-wizard-bar"
      />

      <ProgressBar value={progress} style={styles.progress} testID="event-wizard-progress" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Keyed by step so each step opens scrolled to its top. */}
        <ScrollView
          key={step.key}
          style={styles.flex}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          {/* One title for every step, naming what is being set (UX-CEVT-01). */}
          <Text variant="title" tone="default" accessibilityRole="header" style={styles.title}>
            {t(step.titleKey)}
          </Text>
          <step.Component {...stepProps} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/*
        Multi-value steps keep a primary button fixed at the bottom. A single-choice
        step advances on the tap itself and has none — unless it brings its own
        bottom area (Group's "Continue without group").
      */}
      {step.advanceBy === 'button' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>
          <Button
            label={isLast ? t('finish') : t('next')}
            onPress={onPrimary}
            loading={submitting}
            style={styles.primaryBtn}
          />
        </View>
      ) : Footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>
          <Footer {...stepProps} />
        </View>
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
      {communityId ? (
        <UpgradePrompt
          visible={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          communityId={communityId}
          message={t('upgradeRecurringCap', { ns: 'community' })}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  progress: { paddingHorizontal: space[5], paddingVertical: space[3] },
  inner: { paddingHorizontal: space[6], paddingTop: space[2], paddingBottom: space[6] },
  title: { marginBottom: space[3] },
  footer: {
    paddingHorizontal: space[5],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  // Back is the TopBar's ‹; the primary button owns the whole row.
  primaryBtn: { width: '100%' },
});
