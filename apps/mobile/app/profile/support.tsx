import { useCreateSupportTicket } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, TopBar, useBanner } from '../../components/ui';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors } from '../../theme';

type SupportFieldKey = 'title' | 'description';

/** Pure: both fields are required to file a ticket. */
function validateSupport(values: { title: string; description: string }): Partial<Record<SupportFieldKey, string>> {
  const errors: Partial<Record<SupportFieldKey, string>> = {};
  if (!values.title.trim()) errors.title = 'required';
  if (!values.description.trim()) errors.description = 'required';
  return errors;
}

export default function SupportScreen() {
  const { t } = useT('profile');
  const { t: tc } = useT('common');
  const router = useRouter();
  const banner = useBanner();
  const create = useCreateSupportTicket();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<SupportFieldKey>();
  const dirty = title.trim().length > 0 || description.trim().length > 0;

  const onSend = async () => {
    if (busy) return;
    const errors = validateSupport({ title, description });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      banner.show(tc('missingInformation'));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await create.mutateAsync({ title: title.trim(), description: description.trim() });
      banner.show(t('supportSent'), 'success');
      router.back();
    } catch {
      banner.show(t('supportFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('contactSupport')} onClose={() => router.back()} dirty={dirty} />
      {/*
        keyboardShouldPersistTaps defaults to "never", which means the first tap
        anywhere in this scroller while the keyboard is up is spent DISMISSING the
        keyboard and never reaches the child. Send is the last thing you touch
        after typing, so it took two taps: the first appeared to do nothing at
        all — no banner, no spinner, the form still filled — and the ticket was
        simply never filed. "handled" keeps the dismiss-on-tap-outside behaviour
        for taps no control claims, which is what was actually wanted.
      */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label={t('supportTitle')}
          value={title}
          onChangeText={(v) => { setTitle(v); clearFieldError('title'); }}
          error={fieldErrors.title ? tc('required') : undefined}
          containerStyle={styles.field}
        />
        <Field
          label={t('supportDescription')}
          value={description}
          onChangeText={(v) => { setDescription(v); clearFieldError('description'); }}
          multiline
          error={fieldErrors.description ? tc('required') : undefined}
          containerStyle={styles.field}
        />
        <Button fullWidth label={t('supportSend')} onPress={onSend} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
  field: { marginTop: 8 },
});
