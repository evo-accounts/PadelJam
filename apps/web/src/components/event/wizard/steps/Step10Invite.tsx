'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useGroupMembers } from '@padel/api';
import type { WizardInvitee } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

export function Step10Invite({ draft, patch }: StepProps) {
  const { t } = useT('event');
  const members = useGroupMembers(draft.groupId);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const mixed = draft.specification === 'mixed';

  const invitees = draft.invitees ?? [];

  const toggleMember = (userId: string) => {
    const exists = invitees.some((i) => i.invitee_id === userId);
    patch({
      invitees: exists
        ? invitees.filter((i) => i.invitee_id !== userId)
        : [...invitees, { invitee_id: userId }],
    });
  };

  const addManual = () => {
    // 0113: a manual entry is a guest (name, and gender on a mixed event), confirmed for this event only.
    const entry: WizardInvitee = {
      name: name.trim() || undefined,
      ...(mixed && gender ? { gender } : {}),
    };
    if (!entry.name || (mixed && !gender)) return;
    patch({ invitees: [...invitees, entry] });
    setName('');
    setGender('');
  };

  const removeAt = (index: number) => {
    patch({ invitees: invitees.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex flex-col gap-4">

      {draft.groupId ? (
        <div className="flex flex-col gap-2">
          {(members.data ?? []).map((m) => (
            <SelectableCard
              key={m.user_id}
              title={m.profiles?.full_name ?? m.user_id}
              selected={invitees.some((i) => i.invitee_id === m.user_id)}
              onClick={() => toggleMember(m.user_id)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="space-y-2">
          <Label>{t('inviteeNameLabel')}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {mixed ? (
          <div className="space-y-2">
            <Label>{t('manualGenderLabel')}</Label>
            <div className="flex gap-2" role="radiogroup" aria-label={t('manualGenderLabel')}>
              {(['male', 'female'] as const).map((g) => (
                <Button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gender === g}
                  variant={gender === g ? 'default' : 'outline'}
                  onClick={() => setGender(g)}
                >
                  {t(g === 'male' ? 'genderMale' : 'genderFemale')}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={addManual}
          disabled={name.trim() === '' || (mixed && !gender)}
        >
          {t('addInviteeCta')}
        </Button>
      </div>

      {invitees.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noInvitees')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invitees.map((inv, index) => (
            <li
              key={inv.invitee_id ?? `manual-${index}`}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <span className="text-sm">
                {inv.invitee_id
                  ? (members.data ?? []).find((m) => m.user_id === inv.invitee_id)?.profiles
                      ?.full_name ?? inv.invitee_id
                  : inv.name}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeAt(index)}>
                &times;
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
