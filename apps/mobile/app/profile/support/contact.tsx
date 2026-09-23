import { useCreateSupportTicket } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Screen, TopBar, useBanner } from '../../../components/ui';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors } from '../../../theme';

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
      <Screen scroll padded={false} style={styles.content}>
        <Field
          label={t('supportTitle')}
          value={title}
          onChangeText={(v) => { setTitle(v); clearFieldError('title'); }}
          error={fieldErrors.title ? tc('required') : undefined}
          containerStyle={styles.field}
          testID="support-title"
        />
        <Field
          label={t('supportDescription')}
          value={description}
          onChangeText={(v) => { setDescription(v); clearFieldError('description'); }}
          multiline
          error={fieldErrors.description ? tc('required') : undefined}
          containerStyle={styles.field}
          testID="support-description"
        />
        <Button fullWidth label={t('supportSend')} onPress={onSend} loading={busy} testID="support-send" />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  field: { marginTop: 8 },
});
