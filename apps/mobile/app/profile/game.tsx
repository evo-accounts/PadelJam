/**
 * Game preferences (UX-SET-03).
 *
 * These three lived in the middle of the profile edit form, between the bio and the date of
 * birth — personal data and playing preferences in one undifferentiated list. They are what the
 * Preferences section of a profile displays, so they get their own screen, one block per
 * preference with a title and a short description saying what it is for.
 */
import { useMyProfile, useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDirty } from '@/lib/useDirty';
import { colors, space } from '../../theme';
import { Button, Loading, Screen, Segmented, Text, TopBar, useBanner } from '../../components/ui';

function Block({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.block}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="hint" tone="muted">
        {description}
      </Text>
      {children}
    </View>
  );
}

export default function GamePreferencesScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const banner = useBanner();
  const my = useMyProfile();
  const update = useUpdateProfile();

  const [hand, setHand] = useState<string | null>(null);
  const [side, setSide] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const p = my.data;
    if (!p) return;
    setHand(p.dominant_hand ?? null);
    setSide(p.court_side ?? null);
    setTime(p.preferred_time ?? null);
    setPrefilled(true);
  }, [my.data]);

  const initial = useMemo(
    () => ({
      hand: my.data?.dominant_hand ?? null,
      side: my.data?.court_side ?? null,
      time: my.data?.preferred_time ?? null,
    }),
    [my.data],
  );
  const dirty = useDirty({ hand, side, time }, initial);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await update.mutateAsync({ dominant_hand: hand, court_side: side, preferred_time: time });
      router.back();
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setSaving(false);
    }
  };

  if (my.isLoading) return <Loading testID="game-loading" />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Gate on `prefilled`: the fields are seeded a render after the query resolves, so `dirty`
          is briefly true on load and would otherwise ask to discard changes nobody made. */}
      <TopBar variant="nav" title={t('gameTitle')} onBack={() => router.back()} dirty={prefilled && dirty} />
      <Screen scroll padded={false} style={styles.content}>
        <Block title={t('handLabel')} description={t('handDescription')}>
          {/* `?? ''` renders "nothing chosen" rather than defaulting to an answer the user never
              gave — a preference they have not set must not look like one they have. */}
          <Segmented
            value={hand ?? ''}
            onChange={setHand}
            options={[
              { value: 'left', label: t('handLeft') },
              { value: 'right', label: t('handRight') },
            ]}
            testID="pref-hand"
          />
        </Block>

        <Block title={t('sideLabel')} description={t('sideDescription')}>
          <Segmented
            value={side ?? ''}
            onChange={setSide}
            options={[
              { value: 'left', label: t('sideLeft') },
              { value: 'right', label: t('sideRight') },
            ]}
            testID="pref-side"
          />
        </Block>

        <Block title={t('timeLabel')} description={t('timeDescription')}>
          <Segmented
            value={time ?? ''}
            onChange={setTime}
            options={[
              { value: 'any', label: t('timeAny') },
              { value: 'morning', label: t('timeMorning') },
              { value: 'afternoon', label: t('timeAfternoon') },
              { value: 'night', label: t('timeNight') },
            ]}
            testID="pref-time"
          />
        </Block>
      </Screen>
      {/* Fixed, not scrolled with the form: UX-SET-03 asks for a primary action at the bottom. */}
      <View style={styles.footer}>
        <Button label={t('save')} fullWidth loading={saving} onPress={onSave} testID="game-save" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[6], paddingBottom: space[8] },
  block: { gap: space[2] },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
