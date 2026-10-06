'use client';
/**
 * Account Settings (UX-SET-02), mirrored on web. Replaces `/app/profile/edit`, which is deleted.
 *
 * Same split as mobile: Save commits name, description, avatar, date of birth and gender, while
 * email and mobile are rows opening their own two-phase OTP flow — a code sent to a new address
 * has to be confirmed before the change is real, which is a round trip, not a field.
 *
 * Location is its own card (`ProfileLocationCard`) with its own Save: the geography column's only
 * sanctioned writer is `set_my_location(lat, lng, text)`, which writes the point and the label as a
 * pair. Mobile resolves the place with `expo-location`; web looks it up through the `geocode` edge
 * function (OpenStreetMap Nominatim) or takes the browser's position.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMyProfile, useUpdateProfile } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { avatarUrl, uploadAvatar } from '@/lib/upload';
import { ProfileLocationCard } from '@/components/profile/ProfileLocationCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const rowClass =
  'flex items-center justify-between rounded-md border px-4 py-3 text-sm hover:bg-accent/50 transition-colors';

export default function AccountSettingsPage() {
  const { t } = useT('profile');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const me = useMyProfile();
  const update = useUpdateProfile();

  const [fullName, setFullName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !me.data) return;
    seeded.current = true;
    setFullName(me.data.full_name ?? '');
    setDescription(me.data.description ?? '');
    setGender(me.data.gender ?? '');
    setDob(me.data.date_of_birth ?? '');
  }, [me.data]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (me.isLoading || !me.data) {
    return (
      <div className="max-w-md space-y-4 p-6">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const currentAvatar = preview ?? avatarUrl(me.data.avatar_url) ?? undefined;
  const initials = (fullName || me.data.full_name || '?').slice(0, 2).toUpperCase();

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };

  const onSave = async () => {
    setError(false);
    try {
      let avatar_url: string | undefined;
      if (file && uid) avatar_url = await uploadAvatar(file, uid);
      await update.mutateAsync({
        full_name: fullName,
        description,
        gender: gender || null,
        date_of_birth: dob || null,
        ...(avatar_url ? { avatar_url } : {}),
      });
      router.push('/app/settings');
    } catch {
      setError(true);
    }
  };

  return (
    <div className="max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t('accountTitle')}</h1>

      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full">
          <Avatar className="size-24">
            <AvatarImage src={currentAvatar} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm text-muted-foreground underline"
        >
          {t('changeAvatar')}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('fullName')}</label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('bio')}</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {/* Rows, not fields — each opens its own verification flow. */}
      <div className="space-y-2">
        <Link href="/app/settings/email" className={rowClass}>
          <span>{t('changeEmail')}</span>
          <span className="text-muted-foreground">{me.data.email ?? '—'}</span>
        </Link>
        <Link href="/app/settings/phone" className={rowClass}>
          <span>{t('changePhone')}</span>
          <span className="text-muted-foreground">{me.data.phone ?? '—'}</span>
        </Link>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="dob">
          {t('dobLabel')}
        </label>
        {/* Native on web, so no picker dependency — and `max` refuses a future date in the control
            rather than in a validator the user meets only after pressing Save. */}
        <Input
          id="dob"
          type="date"
          value={dob}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDob(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('genderLabel')}</label>
        <Select value={gender} onValueChange={setGender}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('preferenceUnset')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{t('genderMale')}</SelectItem>
            <SelectItem value="female">{t('genderFemale')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={update.isPending}>
          {t('save')}
        </Button>
        {error ? <span className="text-sm text-destructive">{t('saveError')}</span> : null}
      </div>

      <ProfileLocationCard initialLabel={me.data.location_text ?? ''} />

      <Separator />

      {/* Last item of the form content, as UX-SET-02 specifies — the screen it opens is the one
          that explains what is lost, so this row is a door, not the decision. */}
      <Link href="/app/settings/delete" className={`${rowClass} text-destructive`}>
        <span>{t('deleteAccount')}</span>
        <span aria-hidden>›</span>
      </Link>
    </div>
  );
}
