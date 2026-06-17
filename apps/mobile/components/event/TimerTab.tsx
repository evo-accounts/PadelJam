import { useEventTimer, useSetEventTimer } from '@padel/api';
import { useT } from '@padel/i18n';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNow } from '@/lib/useNow';

function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function TimerTab({ eventId, isOrganizer }: { eventId: string; isOrganizer: boolean }) {
  const { t } = useT('event');
  const { data: timer } = useEventTimer(eventId);
  const setTimer = useSetEventTimer(eventId);
  const nowMs = useNow(1000); // tick every second for the countdown

  const status = timer?.status ?? 'idle';
  const duration = timer?.duration_seconds ?? 0;
  let remaining = duration;
  if (timer?.started_at) {
    if (status === 'running') {
      remaining = duration - (nowMs - Date.parse(timer.started_at)) / 1000;
    } else if (status === 'paused' && timer.paused_at) {
      remaining = duration - (Date.parse(timer.paused_at) - Date.parse(timer.started_at)) / 1000;
    }
  }
  const done = status !== 'idle' && remaining <= 0;

  const act = (a: 'start' | 'pause' | 'resume' | 'reset') => {
    if (setTimer.isPending) return;
    setTimer.mutate(a);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.clock}>{done ? '0:00' : status === 'idle' ? fmt(duration) : fmt(remaining)}</Text>
      <Text style={styles.state}>
        {done ? t('timerDone') : status === 'idle' ? t('timerIdle') : ''}
      </Text>
      {isOrganizer ? (
        <View style={styles.controls}>
          {setTimer.isPending ? (
            <ActivityIndicator color="#0B1F3A" />
          ) : (
            <>
              {status === 'idle' ? (
                <Pressable style={[styles.btn, styles.primary]} onPress={() => act('start')} accessibilityRole="button">
                  <Text style={styles.primaryLabel}>{t('timerStart')}</Text>
                </Pressable>
              ) : null}
              {status === 'running' ? (
                <Pressable style={[styles.btn, styles.primary]} onPress={() => act('pause')} accessibilityRole="button">
                  <Text style={styles.primaryLabel}>{t('timerPause')}</Text>
                </Pressable>
              ) : null}
              {status === 'paused' ? (
                <Pressable style={[styles.btn, styles.primary]} onPress={() => act('resume')} accessibilityRole="button">
                  <Text style={styles.primaryLabel}>{t('timerResume')}</Text>
                </Pressable>
              ) : null}
              {status !== 'idle' ? (
                <Pressable style={[styles.btn, styles.secondary]} onPress={() => act('reset')} accessibilityRole="button">
                  <Text style={styles.secondaryLabel}>{t('timerReset')}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  clock: { fontSize: 72, fontWeight: '800', color: '#0B1F3A', fontVariant: ['tabular-nums'] },
  state: { fontSize: 15, color: '#6B7685', minHeight: 20 },
  controls: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { minHeight: 48, paddingHorizontal: 28, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondary: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
