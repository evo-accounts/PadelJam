import { type CreateEventInput, useCommunityMembers, useCreateEvent, useMyProfile } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { geocodeQuery } from '@padel/utils';
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
import { advanceByFor } from '@/components/event/wizard/draft';
import { invitePayload } from '@/components/event/wizard/invite';
import { normalizeCourtNames } from '@/components/event/wizard/location';
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
  // Which button started the create, so only that one spins: the primary, or "I will invite later".
  const [submitting, setSubmittingState] = useState<'primary' | 'later' | null>(null);
  // State lags a render behind, so a fast double tap could start two creates. The ref flips
  // synchronously; every place that ends a submission clears both through `setSubmitting`.
  const inFlight = useRef(false);
  const setSubmitting = (mode: 'primary' | 'later' | null) => {
    inFlight.current = mode != null;
    setSubmittingState(mode);
  };
  // Invite players checks a mixed event's roster against the organizer's own gender.
  const { data: me } = useMyProfile();
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

  const finalize = async (mode: 'primary' | 'later' = 'primary') => {
    const { eventType, specification, scoringMode, startsAt } = draft;
    if (!eventType || !specification || !scoringMode || !startsAt) return;
    if (inFlight.current) return;
    setSubmitting(mode);

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
        setSubmitting(null);
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
      // A manual venue's name is optional (UX-CEVT-06): blank is no name, not an empty one.
      manualLocationName: draft.manualLocationName?.trim() || undefined,
      manualLocationAddress: draft.manualLocationAddress?.trim() || undefined,
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
      // Platform players are invited, guests confirmed (UX-CEVT-11). None when the path has no
      // Invite players step (a public group event, decision 5) or on "I will invite later".
      ...invitePayload(draft, { later: mode === 'later' }),
      courtIds: draft.courtIds,
      // A manual venue's court names (0113): all or nothing, blanks named "Court N".
      manualCourtNames: normalizeCourtNames(draft, (number) => t('courtNamePlaceholder', { number })),
    };

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
        setSubmitting(null);
        return;
      }
      // Failure is a banner (UX-GLOB-06); a code with no copy of its own reads as the generic one.
      // A capacity refusal caused by a guest reads as one, not as "your gender" (0113 raises the
      // same codes as the join RPCs).
      const hadGuests = (input.guests?.length ?? 0) > 0;
      const message =
        hadGuests && code === 'gender_full'
          ? t('guestGenderFull')
          : hadGuests && code === 'event_full'
            ? t('guestEventFull')
            : t(code, { defaultValue: t('unknown_error') });
      banner.show(message);
      setSubmitting(null);
    }
  };

  // Validate on tap, never a disabled button (UX-GLOB-06). The last VISIBLE step
  // validates too before it finalises — with Invite players skipped, that is Details,
  // whose name is required.
  const onPrimary = () => {
    // A double tap on Next would otherwise answer (or submit) the step it just opened.
    if (Date.now() - lastAdvanceAt.current < ADVANCE_GUARD_MS) return;
    const failing = step.validate(draft, { organizerGender: me?.gender });
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
          // The fixed footer rides up with the keyboard; dragging the list puts both away.
          keyboardDismissMode="on-drag"
        >
          {/* One title for every step, naming what is being set (UX-CEVT-01). */}
          <Text variant="title" tone="default" accessibilityRole="header" style={styles.title}>
            {t(step.titleKey)}
          </Text>
          <step.Component {...stepProps} />
        </ScrollView>

        {/*
          Multi-value steps keep a primary button fixed at the bottom. A single-choice
          step advances on the tap itself and has none — unless it brings its own
          bottom area (Group's "Continue without group"). Inside the KeyboardAvoidingView,
          so the button rides up with the keyboard instead of hiding under it (the manual
          venue form's fields are typed with Next still in reach).
        */}
        {advanceByFor(step, draft) === 'button' ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>
            {/* A button step's own fixed content sits above the button (Date's summary). */}
            {Footer ? <Footer {...stepProps} /> : null}
            <Button
              label={isLast ? t('finish') : t('next')}
              onPress={onPrimary}
              loading={submitting === 'primary'}
              style={styles.primaryBtn}
            />
            {/* Invite players' "I will invite later": the event, with nobody invited yet. */}
            {isLast && step.laterKey ? (
              <Button
                label={t(step.laterKey)}
                variant="ghost"
                onPress={() => {
                  setStepErrors([]);
                  void finalize('later');
                }}
                loading={submitting === 'later'}
                style={styles.laterBtn}
                testID="event-wizard-later"
              />
            ) : null}
          </View>
        ) : Footer ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + space[3] }]}>
            <Footer {...stepProps} />
          </View>
        ) : (
          <View style={{ height: insets.bottom }} />
        )}
      </KeyboardAvoidingView>
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
  laterBtn: { width: '100%', marginTop: space[2] },
});
