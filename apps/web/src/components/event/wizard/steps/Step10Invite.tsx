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
  const members = useGroupMembers(draft.groupId ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

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
    const entry: WizardInvitee = {
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    if (!entry.name && !entry.email && !entry.phone) return;
    patch({ invitees: [...invitees, entry] });
    setName('');
    setEmail('');
    setPhone('');
  };

  const removeAt = (index: number) => {
    patch({ invitees: invitees.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('step10Title')}</h2>

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
        <div className="space-y-2">
          <Label>{t('inviteeEmailLabel')}</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('inviteePhoneLabel')}</Label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={addManual}>
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
                  : inv.name || inv.email || inv.phone}
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
