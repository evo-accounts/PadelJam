import { useCreateSupportTicket } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, TopBar } from '../../components/ui';
import { colors } from '../../theme';

export default function SupportScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const create = useCreateSupportTicket();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = title.trim().length > 0 || description.trim().length > 0;

  const onSend = async () => {
    if (busy) return;
    if (!title.trim() || !description.trim()) {
      setError(t('supportFailed'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await create.mutateAsync({ title: title.trim(), description: description.trim() });
      Alert.alert(t('supportSent'), undefined, [{ text: 'OK', onPress: () => router.back() }]);
    } catch {
      setError(t('supportFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('contactSupport')} onClose={() => router.back()} dirty={dirty} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t('supportTitle')}</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} />
        <Text style={styles.label}>{t('supportDescription')}</Text>
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button fullWidth label={t('supportSend')} onPress={onSend} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  error: { color: colors.destructive, fontSize: 13 },
});
