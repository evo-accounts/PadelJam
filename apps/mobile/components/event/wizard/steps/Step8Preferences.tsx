import { ENTRANCE_FEE_METHODS, ORGANIZER_ROLES } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { SelectableCard } from '../SelectableCard';
import { Stepper } from '../Stepper';
import { colors } from '../../../../theme';
import { Field } from '../../../ui';

const FEE_METHOD_KEYS: Record<(typeof ENTRANCE_FEE_METHODS)[number], string> = {
  cash: 'feeCashLabel',
  at_club: 'feeAt_clubLabel',
  mba: 'feeMbaLabel',
};

const ROLE_KEYS: Record<(typeof ORGANIZER_ROLES)[number], string> = {
  organizing_only: 'roleOrganizing_onlyLabel',
  organizing_and_playing: 'roleOrganizing_and_playingLabel',
};

export function Step8Preferences({ draft, patch, errors }: WizardStepProps) {
  const { t } = useT('event');
  const { t: tc } = useT('common');

  const standaloneLocked = draft.groupId === null;

  const [amountText, setAmountText] = useState(
    draft.entranceFee.amount != null ? String(draft.entranceFee.amount) : '',
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step8Title')}</Text>

      {/* Standby */}
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('standbyLabel')}</Text>
          <Switch
            value={draft.allowStandby}
            onValueChange={(allowStandby) =>
              allowStandby
                ? patch({ allowStandby: true, standbySpots: draft.standbySpots ?? 2 })
                : patch({ allowStandby: false, standbySpots: undefined })
            }
          />
        </View>
        {draft.allowStandby ? (
          <Stepper
            label={t('standbySpotsLabel')}
            value={draft.standbySpots ?? 2}
            onChange={(standbySpots) => patch({ standbySpots })}
            min={1}
            max={8}
          />
        ) : null}
      </View>

      {/* Private */}
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('privateLabel')}</Text>
          <Switch
            value={draft.isPrivate}
            disabled={standaloneLocked}
            onValueChange={(isPrivate) => patch({ isPrivate })}
          />
        </View>
        {draft.isPrivate ? <Text style={styles.hint}>{t('privateRankingWarning')}</Text> : null}
      </View>

      {/* Entrance fee */}
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('feeLabel')}</Text>
          <Switch
            value={draft.entranceFee.enabled}
            onValueChange={(enabled) => patch({ entranceFee: { ...draft.entranceFee, enabled } })}
          />
        </View>
        {draft.entranceFee.enabled ? (
          <View style={styles.section}>
            <Field
              label={t('feeAmountLabel')}
              value={amountText}
              onChangeText={(text) => {
                setAmountText(text);
                const parsed = Number(text);
                patch({
                  entranceFee: {
                    ...draft.entranceFee,
                    amount: text.trim() === '' || Number.isNaN(parsed) ? undefined : parsed,
                  },
                });
              }}
              keyboardType="decimal-pad"
              placeholder={t('feeAmountLabel')}
              error={errors?.includes('feeAmount') ? tc('required') : undefined}
            />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('feeMethodLabel')}</Text>
              <View style={styles.list}>
                {ENTRANCE_FEE_METHODS.map((method) => (
                  <SelectableCard
                    key={method}
                    title={t(FEE_METHOD_KEYS[method])}
                    selected={draft.entranceFee.method === method}
                    onPress={() => patch({ entranceFee: { ...draft.entranceFee, method } })}
                  />
                ))}
              </View>
            </View>

            {draft.entranceFee.method === 'mba' ? (
              <Field
                label={t('feeMbaNumberLabel')}
                value={draft.entranceFee.mbaNumber ?? ''}
                onChangeText={(text) =>
                  patch({
                    entranceFee: { ...draft.entranceFee, mbaNumber: text || undefined },
                  })
                }
                keyboardType="phone-pad"
                placeholder={t('feeMbaNumberLabel')}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Players submit results */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>{t('playersSubmitLabel')}</Text>
        <Switch
          value={draft.playersSubmitResults}
          onValueChange={(playersSubmitResults) => patch({ playersSubmitResults })}
        />
      </View>

      {/* Organizer role */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('organizerRoleLabel')}</Text>
        <View style={styles.list}>
          {ORGANIZER_ROLES.map((role) => (
            <SelectableCard
              key={role}
              title={t(ROLE_KEYS[role])}
              selected={draft.organizerRole === role}
              onPress={() => patch({ organizerRole: role })}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  section: { gap: 12 },
  field: { gap: 8 },
  list: { gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 16, fontWeight: '600', color: colors.foreground, flex: 1 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  hint: { fontSize: 13, color: colors.mutedForeground },
});
