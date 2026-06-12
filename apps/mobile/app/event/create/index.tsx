import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateEventProvider, useEventWizard } from '@/components/event/wizard/CreateEventContext';
import { StepIndicator } from '@/components/event/wizard/StepIndicator';

export default function CreateEventScreen() {
  return (
    <CreateEventProvider>
      <CreateEventWizard />
    </CreateEventProvider>
  );
}

function CreateEventWizard() {
  const { t } = useT('event');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, patch, stepIndex, goNext, goBack, steps, isFirst, isLast, isDirty } =
    useEventWizard();

  const step = steps[stepIndex];
  const canAdvance = step ? step.isValid(draft) : false;

  const onClose = () => {
    if (isDirty) {
      Alert.alert(t('discardTitle'), t('discardBody'), [
        { text: t('discardCancel'), style: 'cancel' },
        { text: t('discardConfirm'), style: 'destructive', onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  const onPrimary = () => {
    if (isLast) {
      // TODO(5.4): finalize -> useCreateEvent
      goNext();
      return;
    }
    goNext();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('createTitle')}</Text>
        <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.close}>{t('close')}</Text>
        </Pressable>
      </View>

      <StepIndicator stepIndex={stepIndex} total={steps.length} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          {step ? <step.Component draft={draft} patch={patch} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {!isFirst ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            style={[styles.btn, styles.backBtn]}
          >
            <Text style={styles.backLabel}>{t('back')}</Text>
          </Pressable>
        ) : (
          <View style={styles.btnSpacer} />
        )}
        <Pressable
          onPress={onPrimary}
          disabled={!canAdvance}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdvance }}
          style={[styles.btn, styles.primaryBtn, !canAdvance && styles.primaryBtnDisabled]}
        >
          <Text style={styles.primaryLabel}>{isLast ? t('finish') : t('next')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  close: { fontSize: 16, fontWeight: '600', color: '#0B7BFF' },
  inner: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSpacer: { width: 1 },
  backBtn: { backgroundColor: '#F0F3F8' },
  backLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  primaryBtn: { backgroundColor: '#0B7BFF', marginLeft: 'auto' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
