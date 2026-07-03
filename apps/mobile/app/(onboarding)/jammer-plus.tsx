import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

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

export default function JammerPlusStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, []);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ onboarded_at: new Date().toISOString() })
          .eq('id', user.id);
      }
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.closeRow}>
        <Pressable onPress={finish} hitSlop={12} accessibilityRole="button">
          <Text style={styles.closeBtn}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>{t('jammerPlusHeadline')}</Text>
        <Text style={styles.subtitle}>{t('jammerPlusSubtitle')}</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <View style={styles.benefitsList}>
          {BENEFIT_KEYS.map((key) => (
            <View key={key} style={styles.benefitRow}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.benefitText}>{t(key)}</Text>
            </View>
          ))}
        </View>

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

        <Pressable onPress={finish} hitSlop={8} style={styles.freeLinkWrapper}>
          <Text style={styles.freeLink}>{t('jammerPlusFree')}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.ctaWrapper, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.ctaBtn, busy && styles.ctaBtnDisabled]}
          onPress={finish}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{t('jammerPlusTrial')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  closeRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  closeBtn: {
    fontSize: 18,
    color: '#0B1F3A',
    fontWeight: '600',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headline: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0B1F3A',
    marginBottom: 6,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7685',
    marginBottom: 20,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#0B1F3A',
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
    color: '#0B1F3A',
    fontWeight: '700',
    marginTop: 1,
  },
  benefitText: {
    fontSize: 15,
    color: '#0B1F3A',
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
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    position: 'relative',
    paddingTop: 24,
  },
  planCardActive: {
    borderColor: '#0B1F3A',
    backgroundColor: '#0B1F3A',
  },
  badge: {
    position: 'absolute',
    top: -12,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  planLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B1F3A',
    marginBottom: 4,
  },
  planLabelActive: {
    color: '#fff',
  },
  planPrice: {
    fontSize: 13,
    color: '#6B7685',
  },
  planPriceActive: {
    color: '#CBD5E1',
  },
  freeLinkWrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  freeLink: {
    fontSize: 14,
    color: '#6B7685',
    textDecorationLine: 'underline',
  },
  ctaWrapper: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  ctaBtn: {
    backgroundColor: '#0B1F3A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
