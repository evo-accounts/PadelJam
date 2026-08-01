import { useEventTimer, useSetEventTimer } from '@padel/api';
import { useT } from '@padel/i18n';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useNow } from '@/lib/useNow';
import { colors } from '../../theme';
import { Button } from '../../components/ui';

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
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <>
              {status === 'idle' ? (
                <Button label={t('timerStart')} onPress={() => act('start')} />
              ) : null}
              {status === 'running' ? (
                <Button label={t('timerPause')} onPress={() => act('pause')} />
              ) : null}
              {status === 'paused' ? (
                <Button label={t('timerResume')} onPress={() => act('resume')} />
              ) : null}
              {status !== 'idle' ? (
                <Button label={t('timerReset')} variant="outline" onPress={() => act('reset')} />
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
  clock: { fontSize: 72, fontWeight: '800', color: colors.foreground, fontVariant: ['tabular-nums'] },
  state: { fontSize: 15, color: colors.mutedForeground, minHeight: 20 },
  controls: { flexDirection: 'row', gap: 12, marginTop: 16 },
});
