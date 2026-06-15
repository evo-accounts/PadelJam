import { useCreateSupportTicket } from '@padel/api';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

export default function SupportScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const create = useCreateSupportTicket();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('contactSupport') }} />
      <Text style={styles.label}>{t('supportTitle')}</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />
      <Text style={styles.label}>{t('supportDescription')}</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.send, busy && styles.sendDisabled]} onPress={onSend} disabled={busy} accessibilityRole="button">
        <Text style={styles.sendText}>{t('supportSend')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  error: { color: '#D7263D', fontSize: 13 },
  send: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
