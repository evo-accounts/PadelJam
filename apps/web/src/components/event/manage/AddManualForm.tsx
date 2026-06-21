'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function AddManualForm({ onAdd }: { onAdd: (name: string, gender?: string) => void }) {
  const { t } = useT('event');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="manual-name">{t('manualNameLabel')}</Label>
        <Input id="manual-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>{t('manualGenderLabel')}</Label>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{t('genderMale')}</SelectItem>
            <SelectItem value="female">{t('genderFemale')}</SelectItem>
            <SelectItem value="other">{t('genderOther')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        className="self-start"
        disabled={name.trim() === ''}
        onClick={() => {
          onAdd(name.trim(), gender || undefined);
          setName('');
          setGender('');
        }}
      >
        {t('addManualCta')}
      </Button>
    </Card>
  );
}
