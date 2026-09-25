'use client';
import { useT } from '@padel/i18n';
import { ENTRANCE_FEE_METHODS, ORGANIZER_ROLES } from '@padel/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Step8Preferences({ draft, patch }: StepProps) {
  const { t } = useT('event');
  const fee = draft.entranceFee;
  const standalone = draft.groupId === null;
  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-center justify-between">
        <Label>{t('standbyToggle')}</Label>
        <Switch
          checked={draft.allowStandby}
          onCheckedChange={(on) => patch({ allowStandby: on })}
        />
      </div>
      {draft.allowStandby ? (
        <div className="space-y-2">
          <Label>{t('standbySpotsLabel')}</Label>
          <Input
            type="number"
            value={draft.standbySpots ?? ''}
            onChange={(e) => patch({ standbySpots: Number(e.target.value) || undefined })}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Label>{t('privateToggle')}</Label>
        {standalone ? (
          <Switch checked disabled />
        ) : (
          <Switch checked={draft.isPrivate} onCheckedChange={(on) => patch({ isPrivate: on })} />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Label>{t('feeToggle')}</Label>
        <Switch
          checked={fee.enabled}
          onCheckedChange={(on) => patch({ entranceFee: { ...fee, enabled: on } })}
        />
      </div>
      {fee.enabled ? (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>{t('feeAmountLabel')}</Label>
            <Input
              type="number"
              value={fee.amount ?? ''}
              onChange={(e) =>
                patch({ entranceFee: { ...fee, amount: Number(e.target.value) || undefined } })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('feeMethodLabel')}</Label>
            <Select
              value={fee.method ?? ''}
              onValueChange={(value) => patch({ entranceFee: { ...fee, method: value } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRANCE_FEE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`fee${cap(m)}Label`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fee.method === 'mba' ? (
            <div className="space-y-2">
              <Label>{t('feeMbaNumberLabel')}</Label>
              <Input
                value={fee.mbaNumber ?? ''}
                onChange={(e) => patch({ entranceFee: { ...fee, mbaNumber: e.target.value } })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Label>{t('playersSubmitToggle')}</Label>
        <Switch
          checked={draft.playersSubmitResults}
          onCheckedChange={(on) => patch({ playersSubmitResults: on })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('organizerRoleLabel')}</Label>
        <Select
          value={draft.organizerRole}
          onValueChange={(value) => patch({ organizerRole: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGANIZER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`role${cap(r)}Label`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
