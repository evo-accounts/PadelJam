import { type CreateEventInput, useCommunityMembers, useCreateEvent } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { geocodeQuery, skipsInvite, splitWizardInvitees } from '@padel/utils';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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

const ADVANCE_GUARD_MS = 300;

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
  // A tap-to-advance card sits where the NEXT step's card will be, so a double tap would answer
  // two steps at once. Presses within ADVANCE_GUARD_MS of the last advance are ignored.
  const lastAdvanceAt = useRef(0);
  const advance = (partial?: Parameters<typeof goNext>[0]) => {
    const now = Date.now();
    if (now - lastAdvanceAt.current < ADVANCE_GUARD_MS) return;
    lastAdvanceAt.current = now;
    setStepErrors([]);
    goNext(partial);
  };

  // The recurring-events cap names a community: the route's, or — opened from Home — the one the
  // picked group belongs to.
  const planCommunityId = communityId || draft.groupCommunityId;
  const { data: communityMembers } = useCommunityMembers(planCommunityId);
  const canManagePlan = communityMembers?.find((m) => m.user_id === uid)?.role === 'admin';

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
      // A path without Invite players sends none — even ones picked before the path changed
      // (e.g. the event was made public afterwards). Public group events invite nobody (decision 5).
      // Interim (0113): manual entries become guests by name until M3 rebuilds the invite step.
      ...(skipsInvite(draft) ? {} : splitWizardInvitees(draft.invitees)),
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
      if (code === 'recurring_events' && planCommunityId) {
        // Since 0098 create_event gates a group event on may_create_event — an admin,
        // OR a member with the create-events permission — so the creator is not
        // necessarily someone who can change the plan. UpgradePrompt gets canManage
        // and offers "OK" instead of "See plans" to a non-admin.
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
    // A double tap on Next would otherwise answer (or submit) the step it just opened.
    if (Date.now() - lastAdvanceAt.current < ADVANCE_GUARD_MS) return;
    const failing = step.validate(draft);
    if (failing.length) {
      setStepErrors(failing);
      banner.show(tc('missingInformation'));
      return;
    }
    setStepErrors([]);
    if (isLast) {
      lastAdvanceAt.current = Date.now();
      void finalize();
      return;
    }
    advance();
  };

  const stepProps = {
    draft,
    patch,
    advance,
    communityId,
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
      {planCommunityId ? (
        <UpgradePrompt
          visible={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          communityId={planCommunityId}
          canManage={canManagePlan}
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
