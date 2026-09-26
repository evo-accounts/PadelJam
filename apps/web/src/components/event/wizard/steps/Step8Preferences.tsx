'use client';
import { useId, useState, type ReactNode } from 'react';
import { useT } from '@padel/i18n';
import { ENTRANCE_FEE_METHODS, ORGANIZER_ROLES, type EntranceFeeMethod } from '@padel/api';
import { DEFAULT_STANDBY, STANDBY_MAX, STANDBY_MIN } from '@padel/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { preferencesErrors } from '../draft-logic';
import { FieldError } from '../FieldError';
import { InfoNote } from '../InfoNote';
import { SegmentedRadio } from '../SegmentedRadio';
import { Stepper } from '../Stepper';
import type { StepProps } from '../types';

const FEE_METHOD_KEYS: Record<EntranceFeeMethod, string> = {
  cash: 'feeCashLabel',
  at_club: 'feeAt_clubLabel',
  mba: 'feeMbaLabel',
};

type Role = (typeof ORGANIZER_ROLES)[number];
const ROLE_KEYS: Record<Role, { title: string; description: string }> = {
  organizing_only: { title: 'roleOrganizing_onlyLabel', description: 'roleOrganizing_onlyDescription' },
  organizing_and_playing: {
    title: 'roleOrganizing_and_playingLabel',
    description: 'roleOrganizing_and_playingDescription',
  },
};

/** A titled group of preferences: everything a toggle opens sits inside its own card. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <h2 id={id} className="text-xs font-medium uppercase text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-lg border p-4">{children}</div>;
}

/** A switch with its label and the line saying what it means; the whole row names the switch. */
function SwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-desc`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-desc`}
        data-testid={testId}
      />
    </div>
  );
}

/**
 * Preferences (UX-CEVT-09), at parity with mobile: four sections of cards — Game details, Invite
 * details, Permissions and "I am…". Every value a toggle enables (the extra spots, the fee's method,
 * amount and MB WAY number) opens inside that toggle's card rather than as a loose field below it.
 * Validated on the primary button (UX-GLOB-06): each field shows its error while it is still wrong.
 */
export function Step8Preferences({ draft, patch, flagged }: StepProps) {
  const { t } = useT('event');
  const fee = draft.entranceFee;
  // An event with no group is always private (the schema refuses anything else).
  const standalone = draft.groupId === null;
  const errors = flagged ? preferencesErrors(draft) : [];
  const [amountText, setAmountText] = useState(fee.amount != null ? String(fee.amount) : '');

  const badAmount = errors.includes('feeAmount');
  const badMba = errors.includes('feeMbaNumber');
  const badStandby = errors.includes('standbySpots');

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('prefGameDetails')}>
        <Card>
          <SwitchRow
            id="pref-standby"
            label={t('standbyLabel')}
            description={t('standbyDescription')}
            checked={draft.allowStandby}
            onChange={(on) =>
              patch(
                on
                  ? { allowStandby: true, standbySpots: draft.standbySpots ?? DEFAULT_STANDBY }
                  : { allowStandby: false, standbySpots: undefined },
              )
            }
            testId="pref-standby-switch"
          />
          {draft.allowStandby ? (
            <>
              <Stepper
                label={t('standbySpotsLabel')}
                value={draft.standbySpots ?? DEFAULT_STANDBY}
                min={STANDBY_MIN}
                max={STANDBY_MAX}
                onChange={(standbySpots) => patch({ standbySpots })}
                decreaseLabel={t('standbyDecreaseLabel')}
                increaseLabel={t('standbyIncreaseLabel')}
                errorId={badStandby ? 'pref-standby-error' : undefined}
                testId="pref-standby-spots"
              />
              <FieldError id="pref-standby-error" show={badStandby} />
            </>
          ) : null}
        </Card>
      </Section>

      <Section title={t('prefInviteDetails')}>
        <Card>
          <SwitchRow
            id="pref-private"
            label={t('privateLabel')}
            description={t('privateDescription')}
            checked={standalone || draft.isPrivate}
            disabled={standalone}
            onChange={(isPrivate) => patch({ isPrivate })}
            testId="pref-private-switch"
          />
          {standalone ? (
            <p className="text-xs text-muted-foreground" data-testid="pref-private-always">
              {t('privateAlwaysStandalone')}
            </p>
          ) : draft.isPrivate ? (
            <InfoNote tone="warning" text={t('privateRankingWarning')} testId="pref-private-warning" />
          ) : null}
        </Card>

        <Card>
          <SwitchRow
            id="pref-fee"
            label={t('feeLabel')}
            description={t('feeDescription')}
            checked={fee.enabled}
            // Cash is picked when the fee is switched on, so the tabs always show a choice.
            onChange={(enabled) =>
              patch({ entranceFee: { ...fee, enabled, method: fee.method ?? (enabled ? 'cash' : undefined) } })
            }
            testId="pref-fee-switch"
          />
          {fee.enabled ? (
            <div className="flex flex-col gap-3">
              <SegmentedRadio<EntranceFeeMethod>
                label={t('feeMethodLabel')}
                options={ENTRANCE_FEE_METHODS.map((m) => ({ value: m, label: t(FEE_METHOD_KEYS[m]) }))}
                value={(fee.method as EntranceFeeMethod | undefined) ?? 'cash'}
                onChange={(method) => patch({ entranceFee: { ...fee, method } })}
                testId="pref-fee-method"
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="pref-fee-amount">{t('feeAmountLabel')}</Label>
                <Input
                  id="pref-fee-amount"
                  inputMode="decimal"
                  placeholder={t('feeAmountPlaceholder')}
                  aria-invalid={badAmount || undefined}
                  aria-describedby={badAmount ? 'pref-fee-amount-error' : undefined}
                  value={amountText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setAmountText(text);
                    const parsed = Number(text.replace(',', '.'));
                    patch({
                      entranceFee: {
                        ...fee,
                        amount: text.trim() === '' || Number.isNaN(parsed) ? undefined : parsed,
                      },
                    });
                  }}
                  data-testid="pref-fee-amount"
                />
                <FieldError id="pref-fee-amount-error" show={badAmount} />
              </div>
              {fee.method === 'mba' ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pref-fee-mba">{t('feeMbaNumberLabel')}</Label>
                  <Input
                    id="pref-fee-mba"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder={t('feeMbaNumberPlaceholder')}
                    aria-invalid={badMba || undefined}
                    aria-describedby={badMba ? 'pref-fee-mba-error' : undefined}
                    value={fee.mbaNumber ?? ''}
                    onChange={(e) => patch({ entranceFee: { ...fee, mbaNumber: e.target.value || undefined } })}
                    data-testid="pref-fee-mba-number"
                  />
                  <FieldError id="pref-fee-mba-error" show={badMba} />
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </Section>

      <Section title={t('prefPermissions')}>
        <Card>
          <SwitchRow
            id="pref-results"
            label={t('playersSubmitLabel')}
            description={t('playersSubmitDescription')}
            checked={draft.playersSubmitResults}
            onChange={(playersSubmitResults) => patch({ playersSubmitResults })}
            testId="pref-results-switch"
          />
        </Card>
      </Section>

      {/* Only whether the organizer starts confirmed — never whether they may join later. */}
      <Section title={t('organizerRoleLabel')}>
        <RoleCards value={draft.organizerRole as Role} onChange={(organizerRole) => patch({ organizerRole })} />
      </Section>
    </div>
  );
}

/** "I am…": two radio cards, each with the line saying what it means. Arrow keys move the choice. */
function RoleCards({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const { t } = useT('event');
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = ORGANIZER_ROLES[(i + step + ORGANIZER_ROLES.length) % ORGANIZER_ROLES.length]!;
    onChange(next);
    (e.currentTarget.parentElement?.children[ORGANIZER_ROLES.indexOf(next)] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t('organizerRoleLabel')} className="flex flex-col gap-2" data-testid="pref-role">
      {ORGANIZER_ROLES.map((role, i) => {
        const checked = role === value;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(role)}
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            )}
            data-testid={`pref-role-${role}`}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                checked ? 'border-primary' : 'border-muted-foreground',
              )}
            >
              {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{t(ROLE_KEYS[role].title)}</span>
              <span className="text-sm text-muted-foreground">{t(ROLE_KEYS[role].description)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
