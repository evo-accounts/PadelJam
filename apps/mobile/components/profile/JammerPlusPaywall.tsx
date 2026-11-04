import { useAccountPlan, useSetAccountPlan } from '@padel/api';
import { useT } from '@padel/i18n';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { PRIVACY_URL, TERMS_URL } from '@/lib/externalUrls';
import { colors, onboardingColors, palette, radius, space, type } from '../../theme';
import { Badge, Card, TopBar, useBanner, useConfirm } from '../ui';

const SPACE_BG = require('../../assets/onboarding/space-bg.jpg');
const ASTRONAUT = require('../../assets/onboarding/astronaut.png');

const BENEFIT_KEYS = [
  'jammerPlusBenefit1',
  'jammerPlusBenefit2',
  'jammerPlusBenefit3',
  'jammerPlusBenefit4',
  'jammerPlusBenefit5',
  'jammerPlusBenefit6',
  'jammerPlusBenefit7',
] as const;

type Plan = 'annual' | 'monthly';

export type JammerPlusPaywallMode = 'onboarding' | 'settings';

type Props = {
  /** `onboarding` keeps the ✕ / "Continue with Free" affordances; `settings` uses the `nav` bar. */
  mode: JammerPlusPaywallMode;
  /**
   * Called once the screen is done: after a successful trial activation (both modes), and after
   * the onboarding-only ✕ / "Continue with Free" affordances (onboarding decides what "done"
   * means — e.g. marking the profile onboarded and navigating to the tabs).
   */
  onDone: () => void;
  /** Back affordance for `settings` mode's `nav` TopBar. Unused in `onboarding` mode. */
  onBack?: () => void;
};

/**
 * The Jammer+ paywall body — reused by the onboarding flow and by Profile settings
 * (UX-GLOB-10). "Try 7-day free trial" actually activates the plan on request; when the
 * caller is already on Jammer+, the trial pitch is replaced by a current-plan card and a
 * "Return to free" action confirmed through the sheet.
 */
export function JammerPlusPaywall({ mode, onDone, onBack }: Props) {
  const { t } = useT('onboarding');
  const insets = useSafeAreaInsets();
  const banner = useBanner();
  const confirm = useConfirm();
  const accountPlan = useAccountPlan();
  const setAccountPlan = useSetAccountPlan();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  // `useRef(new Animated.Value(0)).current` is the old idiom, but it reads a ref
  // during render — and adding `progress` to the effect's deps only moved the
  // complaint, because the deps array is render phase too. A lazy useState gives
  // the same stable-for-the-component's-life value with no ref involved.
  const [progress] = useState(() => new Animated.Value(0));

  const isJammerPlus = accountPlan.data === 'jammer_plus';
  const busy = setAccountPlan.isPending;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    // `progress` is a useRef-held Animated.Value: stable for the component's
    // life, so including it cannot re-fire the animation.
  }, [progress]);

  const showError = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { ns: 'profile', defaultValue: t('unknown_error', { ns: 'profile' }) }));
  };

  const activateTrial = async () => {
    if (busy) return;
    try {
      await setAccountPlan.mutateAsync('jammer_plus');
      banner.show(t('jammerPlusActivated', { ns: 'profile' }), 'success');
      onDone();
    } catch (e) {
      showError(e);
    }
  };

  const returnToFree = async () => {
    const ok = await confirm({
      title: t('returnToFreeTitle', { ns: 'profile' }),
      body: t('returnToFreeBody', { ns: 'profile' }),
      confirmLabel: t('returnToFree', { ns: 'profile' }),
      destructive: true,
    });
    if (!ok) return;
    try {
      await setAccountPlan.mutateAsync('free');
    } catch (e) {
      showError(e);
    }
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (accountPlan.isLoading) {
    // Neutral state while the plan query is in flight — `isJammerPlus` defaults to false
    // on undefined data, which would otherwise flash the free-plan pitch to a Jammer+
    // member before the real plan resolves.
    return (
      <View style={[styles.root, styles.loadingRoot, mode === 'onboarding' && { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  // Onboarding has its own layout (frame 11); `settings` keeps the one below, unchanged.
  if (mode === 'onboarding') {
    return (
      <OnboardingPlans
        isJammerPlus={isJammerPlus}
        busy={busy}
        onTry={activateTrial}
        onDone={onDone}
      />
    );
  }

  return (
    <View style={styles.root}>
      <TopBar variant="nav" onBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>{t('jammerPlusHeadline')}</Text>
        <Text style={styles.subtitle}>{t('jammerPlusSubtitle')}</Text>

        {!isJammerPlus ? (
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        ) : null}

        <View style={styles.benefitsList}>
          {BENEFIT_KEYS.map((key) => (
            <View key={key} style={styles.benefitRow}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.benefitText}>{t(key)}</Text>
            </View>
          ))}
        </View>

        {isJammerPlus ? (
          <Card padding="md" style={styles.currentPlanCard}>
            <View style={styles.currentPlanRow}>
              <Text style={styles.currentPlanLabel}>{t('planJammerPlus', { ns: 'profile' })}</Text>
              <Badge label="✓" tone="primary" />
            </View>
          </Card>
        ) : (
          <View style={styles.plansRow}>
            {(['annual', 'monthly'] as const).map((plan) => {
              const isSelected = selectedPlan === plan;
              const isAnnual = plan === 'annual';
              return (
                <Pressable
                  key={plan}
                  style={[styles.planCard, isSelected && styles.planCardActive]}
                  onPress={() => setSelectedPlan(plan)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  {isAnnual && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{t('jammerPlusMostPopular')}</Text>
                    </View>
                  )}
                  <Text style={[styles.planLabel, isSelected && styles.planLabelActive]}>
                    {t(isAnnual ? 'jammerPlusAnnualLabel' : 'jammerPlusMonthlyLabel')}
                  </Text>
                  <Text style={[styles.planPrice, isSelected && styles.planPriceActive]}>
                    {t(isAnnual ? 'jammerPlusAnnualPrice' : 'jammerPlusMonthlyPrice')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

      </ScrollView>

      <View style={[styles.ctaWrapper, { paddingBottom: insets.bottom + 16 }]}>
        {isJammerPlus ? (
          <Pressable
            style={[styles.ctaBtn, styles.returnBtn, busy && styles.ctaBtnDisabled]}
            onPress={returnToFree}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.returnText}>{t('returnToFree', { ns: 'profile' })}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.ctaBtn, busy && styles.ctaBtnDisabled]}
            onPress={activateTrial}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{t('jammerPlusTrial')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Frame 11, onboarding only. There is no purchase yet, so it carries no price, trial length,
 * reminder or "Restore purchases" (spec §4.7): each would be untrue. ✕ finishes onboarding on
 * Free, and is named for what it does rather than "close".
 */
function OnboardingPlans({
  isJammerPlus,
  busy,
  onTry,
  onDone,
}: {
  isJammerPlus: boolean;
  busy: boolean;
  onTry: () => void;
  onDone: () => void;
}) {
  const { t } = useT('onboarding');
  const insets = useSafeAreaInsets();
  return (
    <View style={[plans.root, { paddingTop: insets.top + space[2] }]} testID="plans-screen">
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" pointerEvents="none">
        <Defs>
          <LinearGradient id="plansBackdrop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={onboardingColors.plansFrom} />
            <Stop offset="1" stopColor={onboardingColors.plansTo} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#plansBackdrop)" />
      </Svg>
      <Image source={SPACE_BG} style={plans.spaceBg} resizeMode="cover" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

      <View style={plans.closeRow}>
        <Pressable
          onPress={onDone}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('jammerPlusFree')}
          style={plans.close}
          testID="plans-close"
        >
          <Text style={plans.closeGlyph}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={plans.scroll} showsVerticalScrollIndicator={false}>
        <Image
          source={ASTRONAUT}
          style={plans.astronaut}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Text style={plans.title} accessibilityRole="header">
          {t('jammerPlusLead')} <Text style={plans.accent}>Jammer+</Text>
        </Text>
        <Text style={plans.body}>{t('jammerPlusOnboardingBody')}</Text>
        <View style={plans.today}>
          <View style={plans.dot} />
          <View style={plans.todayText}>
            <Text style={plans.todayTitle}>{t('jammerPlusToday')}</Text>
            <Text style={plans.todayBody}>{t('jammerPlusTodayBody')}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[plans.actions, { paddingBottom: insets.bottom + space[4] }]}>
        <Pressable
          style={[plans.cta, busy && plans.ctaDisabled]}
          onPress={isJammerPlus ? onDone : onTry}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={isJammerPlus ? t('continue') : t('jammerPlusTry')}
          testID="plans-try"
        >
          <Text style={plans.ctaText}>{isJammerPlus ? t('continue') : t('jammerPlusTry')}</Text>
        </Pressable>
        <View style={plans.links}>
          <Pressable
            onPress={() => void Linking.openURL(TERMS_URL)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={t('jammerPlusTerms')}
          >
            <Text style={plans.link}>{t('jammerPlusTerms')}</Text>
          </Pressable>
          <Text style={plans.link} accessibilityElementsHidden importantForAccessibility="no">
            ·
          </Text>
          <Pressable
            onPress={() => void Linking.openURL(PRIVACY_URL)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={t('jammerPlusPrivacy')}
          >
            <Text style={plans.link}>{t('jammerPlusPrivacy')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const plans = StyleSheet.create({
  root: { flex: 1, backgroundColor: onboardingColors.plansFrom, paddingHorizontal: space[6] },
  closeRow: { alignItems: 'flex-end' },
  close: {
    width: space[10],
    height: space[10],
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.purple[800],
  },
  closeGlyph: { ...type.bodyStrong, color: colors.card },
  spaceBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 300, opacity: 0.55 },
  astronaut: { alignSelf: 'center', width: 200, height: 225, marginBottom: space[4] },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: space[6] },
  title: { ...type.display, color: colors.card, textAlign: 'center' },
  accent: { color: onboardingColors.plansAccent },
  body: { ...type.body, color: palette.purple[100], textAlign: 'center', marginTop: space[3], marginBottom: space[8] },
  today: { flexDirection: 'row', gap: space[4] },
  dot: {
    width: space[6],
    height: space[6],
    borderRadius: radius.full,
    backgroundColor: onboardingColors.plansAccent,
  },
  todayText: { flex: 1 },
  todayTitle: { ...type.bodyStrong, color: onboardingColors.plansAccent },
  todayBody: { ...type.body, color: colors.card, marginTop: space[1] },
  actions: { gap: space[4], paddingTop: space[4] },
  cta: {
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.slate[50],
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { ...type.buttonLg, color: palette.slate[800] },
  links: { flexDirection: 'row', justifyContent: 'center', gap: space[2] },
  link: { ...type.caption, color: palette.purple[200] },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.card,
  },
  loadingRoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.foreground,
    marginBottom: 6,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginBottom: 20,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.muted,
    borderRadius: 2,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  benefitsList: {
    gap: 14,
    marginBottom: 28,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkmark: {
    fontSize: 16,
    color: colors.foreground,
    fontWeight: '700',
    marginTop: 1,
  },
  benefitText: {
    fontSize: 15,
    color: colors.foreground,
    flex: 1,
    lineHeight: 22,
  },
  plansRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  planCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    position: 'relative',
    paddingTop: 24,
  },
  planCardActive: {
    borderColor: colors.foreground,
    backgroundColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -12,
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.card,
  },
  planLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  planLabelActive: {
    color: colors.card,
  },
  planPrice: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  planPriceActive: {
    color: palette.slate[300],
  },
  currentPlanCard: {
    marginBottom: 20,
  },
  currentPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentPlanLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
  },
  ctaWrapper: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  ctaBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '600',
  },
  returnBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.destructive,
  },
  returnText: {
    color: colors.destructive,
    fontSize: 16,
    fontWeight: '600',
  },
});
