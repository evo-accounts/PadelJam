import { SPECIFICATIONS } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { SelectableCard } from '../SelectableCard';
import { space } from '../../../../theme';
import { Badge } from '../../../ui';

/**
 * Players (UX-CEVT-04): the format chosen on the previous step as a read-only chip, so the
 * organizer keeps the context, then Classic / Mixed / Team; the tap sets it and advances.
 * Neither can change once the event exists (UX-LIVE-20).
 */
export function Step3Spec({ draft, advance }: WizardStepProps) {
  const { t } = useT('event');
  const format = draft.eventType;
  const formatLabel = format
    ? t(`type${format[0]?.toUpperCase() ?? ''}${format.slice(1)}Label`)
    : null;

  return (
    <View style={styles.container}>
      {formatLabel ? (
        <View style={styles.chipRow}>
          <Badge label={formatLabel} tone="primary" testID="event-wizard-format-chip" />
        </View>
      ) : null}
      <View style={styles.list}>
        {SPECIFICATIONS.map((value) => {
          const cap = `spec${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
          return (
            <SelectableCard
              key={value}
              title={t(`${cap}Label`)}
              subtitle={t(`${cap}Desc`)}
              selected={false}
              onPress={() => advance?.({ specification: value })}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
  chipRow: { flexDirection: 'row' },
  list: { gap: space[3] },
});
