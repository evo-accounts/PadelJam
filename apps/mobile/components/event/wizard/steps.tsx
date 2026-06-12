import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { EventDraft, WizardStep } from './draft';

// Placeholder step bodies — replaced by real steps in Tasks 5.3/5.4. Keep this STEPS array shape.

function makePlaceholder(titleKey: string) {
  return function PlaceholderStep() {
    const { t } = useT('event');
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        {/* Cross-namespace ref: 'comingSoon' lives in the community namespace, not event. */}
        <Text style={styles.hint}>{t('community:comingSoon')}</Text>
      </View>
    );
  };
}

export const STEPS: WizardStep[] = [
  {
    key: 'step1',
    titleKey: 'step1Title',
    Component: makePlaceholder('step1Title'),
    isValid: () => true,
  },
  {
    key: 'step2',
    titleKey: 'step2Title',
    Component: makePlaceholder('step2Title'),
    isValid: (d: EventDraft) => Boolean(d.eventType),
  },
  {
    key: 'step3',
    titleKey: 'step3Title',
    Component: makePlaceholder('step3Title'),
    isValid: (d: EventDraft) => Boolean(d.specification),
  },
  {
    key: 'step4',
    titleKey: 'step4Title',
    Component: makePlaceholder('step4Title'),
    isValid: (d: EventDraft) => Boolean(d.scoringMode),
  },
  {
    key: 'step5',
    titleKey: 'step5Title',
    Component: makePlaceholder('step5Title'),
    isValid: () => true,
  },
  {
    key: 'step6',
    titleKey: 'step6Title',
    Component: makePlaceholder('step6Title'),
    isValid: () => true,
  },
  {
    key: 'step7',
    titleKey: 'step7Title',
    Component: makePlaceholder('step7Title'),
    isValid: () => true,
  },
  {
    key: 'step8',
    titleKey: 'step8Title',
    Component: makePlaceholder('step8Title'),
    isValid: () => true,
  },
  {
    key: 'step9',
    titleKey: 'step9Title',
    Component: makePlaceholder('step9Title'),
    isValid: (d: EventDraft) => d.name.trim().length > 0,
  },
  {
    key: 'step10',
    titleKey: 'step10Title',
    Component: makePlaceholder('step10Title'),
    isValid: () => true,
  },
];

const styles = StyleSheet.create({
  container: { paddingVertical: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A', marginBottom: 8 },
  hint: { fontSize: 15, color: '#6B7685' },
});
