import { initialOtpState, otpReducer, signInWithPassword } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useReducer, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, useBanner } from '../../components/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { safeAuthMessage } from '@/lib/authErrors';
import { getAuthTarget } from '@/lib/auth-flow';
import { decidePostVerifyRoute } from '@/lib/postVerifyRoute';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';

export default function PasswordScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { identifier, kind } = getAuthTarget();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, dispatch] = useReducer(otpReducer, undefined, initialOtpState);

  const submit = async () => {
    if (busy) return;
    if (state.locked) { banner.show(t('passwordRateLimited')); return; }
    if (!password) { banner.show(tc('missingInformation')); return; }
    setBusy(true);
    try {
      const { data, error: signInError } = await signInWithPassword(supabase, identifier, kind, password);
      if (signInError || !data.user) {
        dispatch({ type: 'fail' });
        banner.show(t('passwordWrong'));
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('onboarded_at, location_text, dominant_hand, court_side, notifications_prompted_at')
        .eq('id', data.user.id)
        .maybeSingle();
      const decision = decidePostVerifyRoute(profile, profileError);
      if (decision.kind === 'error') {
        const { ns, key } = safeAuthMessage(decision.message);
        banner.show(t(key, { ns }));
        return;
      }
      router.replace(decision.target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>{t('passwordTitle')}</Text>
      <Text style={styles.help}>{t('otpHelp', { identifier })}</Text>
      <Text style={styles.label}>{t('passwordLabel')}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy && !state.locked}
        autoFocus
      />
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={colors.card} /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
      </Pressable>
      <Button label={t('forgotPassword')} variant="ghost" onPress={() => router.push('/(auth)/recovery' as never)} />
      <Button label={t('tryAnotherWay')} variant="ghost" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.foreground, marginBottom: 8 },
  help: { fontSize: 14, color: colors.mutedForeground, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.card, fontWeight: '700', fontSize: 16 },
  linkButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
