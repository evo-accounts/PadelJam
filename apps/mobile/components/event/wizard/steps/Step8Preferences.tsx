import { ENTRANCE_FEE_METHODS, type EntranceFeeMethod, ORGANIZER_ROLES } from '@padel/api';
import { useT } from '@padel/i18n';
import { DEFAULT_STANDBY, STANDBY_MAX, STANDBY_MIN } from '@padel/utils';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { InfoNote } from '../InfoNote';
import { Stepper } from '../Stepper';
import { space } from '../../../../theme';
import { Card, Field, RadioCardGroup, Segmented, SwitchRow, Text } from '../../../ui';

const FEE_METHOD_KEYS: Record<EntranceFeeMethod, string> = {
  cash: 'feeCashLabel',
  at_club: 'feeAt_clubLabel',
  mba: 'feeMbaLabel',
};

const ROLE_KEYS: Record<(typeof ORGANIZER_ROLES)[number], { title: string; description: string }> = {
  organizing_only: { title: 'roleOrganizing_onlyLabel', description: 'roleOrganizing_onlyDescription' },
  organizing_and_playing: {
    title: 'roleOrganizing_and_playingLabel',
    description: 'roleOrganizing_and_playingDescription',
  },
};

/** A titled group of preferences: everything a toggle opens sits inside its own card. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * Preferences (UX-CEVT-09): four sections of cards — Game details, Invite details, Permissions and
 * "I am…". Every value a toggle enables (the extra spots, the fee's method, amount and MB WAY
 * number) opens inside that toggle's card rather than as a loose field below it.
 *
 * Also reused by `event/[id]/edit.tsx`, which passes no `errors`.
 */
export function Step8Preferences({ draft, patch, errors, clearError }: WizardStepProps) {
  const { t } = useT('event');
  const { t: tc } = useT('common');

  // An event with no group is always private (the schema refuses anything else).
  const standalone = draft.groupId === null;
  const fee = draft.entranceFee;

  const [amountText, setAmountText] = useState(fee.amount != null ? String(fee.amount) : '');

  return (
    <View style={styles.container}>
      <Section title={t('prefGameDetails')}>
        <Card style={styles.card}>
          <SwitchRow
            label={t('standbyLabel')}
            description={t('standbyDescription')}
            value={draft.allowStandby}
            onValueChange={(on) =>
              patch(
                on
                  ? { allowStandby: true, standbySpots: draft.standbySpots ?? DEFAULT_STANDBY }
                  : { allowStandby: false, standbySpots: undefined },
              )
            }
            testID="pref-standby-switch"
          />
          {draft.allowStandby ? (
            <Stepper
              label={t('standbySpotsLabel')}
              value={draft.standbySpots ?? DEFAULT_STANDBY}
              onChange={(standbySpots) => {
                patch({ standbySpots });
                clearError?.('standbySpots');
              }}
              min={STANDBY_MIN}
              max={STANDBY_MAX}
            />
          ) : null}
        </Card>
      </Section>

      <Section title={t('prefInviteDetails')}>
        <Card style={styles.card}>
          <SwitchRow
            label={t('privateLabel')}
            description={t('privateDescription')}
            value={standalone || draft.isPrivate}
            disabled={standalone}
            onValueChange={(isPrivate) => patch({ isPrivate })}
            testID="pref-private-switch"
          />
          {standalone ? (
            <Text variant="caption" tone="muted" testID="pref-private-always">
              {t('privateAlwaysStandalone')}
            </Text>
          ) : draft.isPrivate ? (
            <InfoNote tone="warning" text={t('privateRankingWarning')} testID="pref-private-warning" />
          ) : null}
        </Card>

        <Card style={styles.card}>
          <SwitchRow
            label={t('feeLabel')}
            description={t('feeDescription')}
            value={fee.enabled}
            onValueChange={(enabled) =>
              // Cash is picked when the fee is switched on, so the tabs always show a choice.
              patch({ entranceFee: { ...fee, enabled, method: fee.method ?? (enabled ? 'cash' : undefined) } })
            }
            testID="pref-fee-switch"
          />
          {fee.enabled ? (
            <View style={styles.inner}>
              <Segmented
                options={ENTRANCE_FEE_METHODS.map((m) => ({ value: m, label: t(FEE_METHOD_KEYS[m]) }))}
                value={fee.method ?? 'cash'}
                onChange={(method) => {
                  patch({ entranceFee: { ...fee, method } });
                  clearError?.('feeMethod');
                }}
                testID="pref-fee-method"
              />
              <Field
                label={t('feeAmountLabel')}
                value={amountText}
                onChangeText={(text) => {
                  setAmountText(text);
                  const parsed = Number(text.replace(',', '.'));
                  patch({
                    entranceFee: {
                      ...fee,
                      amount: text.trim() === '' || Number.isNaN(parsed) ? undefined : parsed,
                    },
                  });
                  clearError?.('feeAmount');
                }}
                keyboardType="decimal-pad"
                placeholder={t('feeAmountPlaceholder')}
                error={errors?.includes('feeAmount') ? tc('required') : undefined}
                testID="pref-fee-amount"
              />
              {fee.method === 'mba' ? (
                <Field
                  label={t('feeMbaNumberLabel')}
                  value={fee.mbaNumber ?? ''}
                  onChangeText={(text) => {
                    patch({ entranceFee: { ...fee, mbaNumber: text || undefined } });
                    clearError?.('feeMbaNumber');
                  }}
                  keyboardType="phone-pad"
                  placeholder={t('feeMbaNumberPlaceholder')}
                  error={errors?.includes('feeMbaNumber') ? tc('required') : undefined}
                  testID="pref-fee-mba-number"
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title={t('prefPermissions')}>
        <Card style={styles.card}>
          <SwitchRow
            label={t('playersSubmitLabel')}
            description={t('playersSubmitDescription')}
            value={draft.playersSubmitResults}
            onValueChange={(playersSubmitResults) => patch({ playersSubmitResults })}
            testID="pref-results-switch"
          />
        </Card>
      </Section>

      {/* Only whether the organizer starts confirmed — never whether they may join later. */}
      <Section title={t('organizerRoleLabel')}>
        <RadioCardGroup
          options={ORGANIZER_ROLES.map((role) => ({
            value: role,
            title: t(ROLE_KEYS[role].title),
            description: t(ROLE_KEYS[role].description),
          }))}
          value={draft.organizerRole}
          onChange={(organizerRole) => patch({ organizerRole })}
          testID="pref-role"
        />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[5] },
  section: { gap: space[2] },
  card: { gap: space[4] },
  inner: { gap: space[3] },
});
