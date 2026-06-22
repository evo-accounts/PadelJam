'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useMyProfile, useUpdateProfile } from '@padel/api';
import { uploadAvatar, avatarUrl } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function EditProfilePage() {
  const { t } = useT('profile');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const me = useMyProfile();
  const update = useUpdateProfile();

  const [fullName, setFullName] = useState('');
  const [description, setDescription] = useState('');
  const [dominantHand, setDominantHand] = useState('');
  const [courtSide, setCourtSide] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  // Seed the controlled fields once from the loaded profile.
  useEffect(() => {
    if (seeded.current || !me.data) return;
    seeded.current = true;
    setFullName(me.data.full_name ?? '');
    setDescription(me.data.description ?? '');
    setDominantHand(me.data.dominant_hand ?? '');
    setCourtSide(me.data.court_side ?? '');
    setPreferredTime(me.data.preferred_time ?? '');
  }, [me.data]);

  // Revoke the object URL when the preview changes / unmounts to avoid leaking blobs.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (me.isLoading || !me.data) {
    return (
      <div className="p-6 space-y-4">
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
    setSaved(false);
    setError(false);
    try {
      let avatar_url: string | undefined = undefined;
      if (file && uid) avatar_url = await uploadAvatar(file, uid);
      await update.mutateAsync({
        full_name: fullName,
        description,
        dominant_hand: dominantHand || null,
        court_side: courtSide || null,
        preferred_time: preferredTime || null,
        ...(avatar_url ? { avatar_url } : {}),
      });
      setSaved(true);
      router.push('/app/profile');
    } catch {
      setError(true);
    }
  };

  return (
    <div className="p-6 max-w-md space-y-6">
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('fullName')}</label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('bio')}</label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('dominantHand')}</label>
        <Select value={dominantHand} onValueChange={setDominantHand}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">{t('left')}</SelectItem>
            <SelectItem value="right">{t('right')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('courtSide')}</label>
        <Select value={courtSide} onValueChange={setCourtSide}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">{t('left')}</SelectItem>
            <SelectItem value="right">{t('right')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('preferredTime')}</label>
        <Select value={preferredTime} onValueChange={setPreferredTime}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t('any')}</SelectItem>
            <SelectItem value="morning">{t('morning')}</SelectItem>
            <SelectItem value="afternoon">{t('afternoon')}</SelectItem>
            <SelectItem value="night">{t('night')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={update.isPending}>
          {t('save')}
        </Button>
        {saved ? <span className="text-sm text-success">{t('saved')}</span> : null}
        {error ? <span className="text-sm text-destructive">{t('saveError')}</span> : null}
      </div>
    </div>
  );
}
