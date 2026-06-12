import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { EventDraft, WizardStep } from './draft';
import { Step1Group } from './steps/Step1Group';
import { Step2Type } from './steps/Step2Type';
import { Step3Spec } from './steps/Step3Spec';
import { Step4Scoring } from './steps/Step4Scoring';
import { Step5Location } from './steps/Step5Location';
import { Step6Courts } from './steps/Step6Courts';

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
    Component: Step1Group,
    isValid: () => true,
  },
  {
    key: 'step2',
    titleKey: 'step2Title',
    Component: Step2Type,
    isValid: (d: EventDraft) => Boolean(d.eventType),
  },
  {
    key: 'step3',
    titleKey: 'step3Title',
    Component: Step3Spec,
    isValid: (d: EventDraft) => Boolean(d.specification),
  },
  {
    key: 'step4',
    titleKey: 'step4Title',
    Component: Step4Scoring,
    isValid: (d: EventDraft) =>
      Boolean(d.scoringMode) &&
      (d.scoringMode === 'classic' || (d.scoringValue != null && d.scoringValue > 0)),
  },
  {
    key: 'step5',
    titleKey: 'step5Title',
    Component: Step5Location,
    isValid: () => true,
  },
  {
    key: 'step6',
    titleKey: 'step6Title',
    Component: Step6Courts,
    isValid: (d: EventDraft) => d.numCourts >= 1,
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
