'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useMyGroups, useGroup, useUpdateGroup } from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
import { communityImageUrl } from '@/lib/community-images';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function GroupManageSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('group');
  const mine = useMyGroups();
  const group = useGroup(id);
  const update = useUpdateGroup(id, group.data?.community_id ?? '');

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !group.data) return;
    seeded.current = true;
    setName(group.data.name ?? '');
    setDescription(group.data.description ?? '');
    setIsPrivate(group.data.is_private ?? false);
  }, [group.data]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onFileChange = (f: File | null) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let thumbnail_path: string | undefined;
    try {
      if (file) thumbnail_path = await uploadCommunityImage(file, id, 'community-thumbnails');
    } catch {
      // image upload failed; still save the text fields
    }
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        is_private: isPrivate,
        ...(thumbnail_path ? { thumbnail_path } : {}),
      });
      router.push(`/app/group/${id}`);
    } catch {
      setError(t('saveError'));
      setBusy(false);
    }
  };

  if (mine.isLoading || group.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging || !group.data) return null;

  const currentThumb = communityImageUrl(group.data.thumbnail_path, 'community-thumbnails');

  return (
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('settingsRow')}</h1>
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t('groupName')}</Label>
              <Input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="private">{t('privateLabel')}</Label>
              <Switch id="private" checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thumbnail">{t('thumbnailLabel')}</Label>
              <input
                id="thumbnail"
                type="file"
                accept="image/*"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              {preview ?? currentThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview ?? currentThumb ?? undefined}
                  alt=""
                  className="h-24 w-24 rounded object-cover"
                />
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t('saving') : t('save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
