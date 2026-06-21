'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useCanCreateGroup, useCreateGroup, useDb } from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function GroupCreatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('group');
  const db = useDb();
  const canCreate = useCanCreateGroup(id);
  const create = useCreateGroup();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Redirect if the entitlement check resolves to "not allowed".
  useEffect(() => {
    if (!canCreate.isLoading && canCreate.data === false) {
      router.replace(`/app/community/${id}`);
    }
  }, [canCreate.isLoading, canCreate.data, id, router]);

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
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const newId = (await create.mutateAsync({
        communityId: id,
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      })) as string;
      if (file) {
        // Non-fatal: group already exists; thumbnail can be set later in Settings.
        try {
          const path = await uploadCommunityImage(file, newId, 'community-thumbnails');
          await db.from('groups').update({ thumbnail_path: path }).eq('id', newId);
        } catch {
          // ignore — thumbnail optional
        }
      }
      router.replace(`/app/group/${newId}`);
    } catch {
      setError(t('unknown_error'));
      setBusy(false);
    }
  };

  if (canCreate.isLoading) return <Skeleton className="m-6 h-40" />;
  if (canCreate.data === false) return null;

  return (
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('createTitle')}</h1>
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t('groupName')}</Label>
              <Input
                id="name"
                value={name}
                placeholder={t('groupNamePlaceholder')}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
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
              <div className="space-y-1">
                <Label htmlFor="private">{t('privateLabel')}</Label>
                <p className="text-xs text-muted-foreground">{t('privateHint')}</p>
              </div>
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
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-24 w-24 rounded object-cover" />
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
              {busy ? t('saving') : t('createCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
