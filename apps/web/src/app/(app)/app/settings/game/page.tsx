'use client';
/**
 * Game preferences (UX-SET-03), mirrored on web.
 *
 * These three lived in the middle of the profile edit form, between the bio and the avatar picker
 * — personal data and playing preferences in one undifferentiated list. They are what a profile's
 * Preferences section shows, so they get their own screen, one block per preference with a short
 * description of what it is for.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMyProfile, useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export default function GamePreferencesPage() {
  const { t } = useT('profile');
  const router = useRouter();
  const me = useMyProfile();
  const update = useUpdateProfile();

  const [hand, setHand] = useState('');
  const [side, setSide] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !me.data) return;
    seeded.current = true;
    setHand(me.data.dominant_hand ?? '');
    setSide(me.data.court_side ?? '');
    setTime(me.data.preferred_time ?? '');
  }, [me.data]);

  if (me.isLoading || !me.data) {
    return (
      <div className="max-w-md space-y-4 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const onSave = async () => {
    setError(false);
    try {
      await update.mutateAsync({
        dominant_hand: hand || null,
        court_side: side || null,
        preferred_time: time || null,
      });
      router.push('/app/settings');
    } catch {
      setError(true);
    }
  };

  const blocks = [
    {
      key: 'hand',
      label: t('dominantHand'),
      description: t('handDescription'),
      value: hand,
      set: setHand,
      options: [
        { value: 'left', label: t('left') },
        { value: 'right', label: t('right') },
      ],
    },
    {
      key: 'side',
      label: t('courtSide'),
      description: t('sideDescription'),
      value: side,
      set: setSide,
      options: [
        { value: 'left', label: t('left') },
        { value: 'right', label: t('right') },
      ],
    },
    {
      key: 'time',
      label: t('preferredTime'),
      description: t('timeDescription'),
      value: time,
      set: setTime,
      options: [
        { value: 'any', label: t('any') },
        { value: 'morning', label: t('morning') },
        { value: 'afternoon', label: t('afternoon') },
        { value: 'night', label: t('night') },
      ],
    },
  ];

  return (
    <div className="max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t('gameTitle')}</h1>
      {blocks.map((b) => (
        <Card key={b.key}>
          <CardContent className="space-y-2 pt-6">
            <p className="font-medium">{b.label}</p>
            <p className="text-sm text-muted-foreground">{b.description}</p>
            <Select value={b.value} onValueChange={b.set}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('preferenceUnset')} />
              </SelectTrigger>
              <SelectContent>
                {b.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={update.isPending}>
          {t('save')}
        </Button>
        {error ? <span className="text-sm text-destructive">{t('saveError')}</span> : null}
      </div>
    </div>
  );
}
