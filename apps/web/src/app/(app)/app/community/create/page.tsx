'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useT } from '@padel/i18n';
import { createCommunitySchema, useCreateCommunity, useCanCreateCommunity } from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
import { supabase } from '@/lib/supabase/client';
import type { TypedClient } from '@padel/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CommunityType = 'club' | 'team' | 'friends';
type Privacy = 'public' | 'request_to_join' | 'private';

export default function CreateCommunityPage() {
  const { t } = useT('community');
  const create = useCreateCommunity();
  const canCreate = useCanCreateCommunity();
  const router = useRouter();
  const { i18n } = useTranslation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<CommunityType>('club');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [rulesEnabled, setRulesEnabled] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    };
  }, [thumbnailPreview]);
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const onThumbnailChange = (file: File | null) => {
    setThumbnailPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setThumbnailFile(file);
  };
  const onCoverChange = (file: File | null) => {
    setCoverPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setCoverFile(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createCommunitySchema.safeParse({
      name,
      description: description || undefined,
      location: location || undefined,
      type,
      privacy,
      rules: { enabled: rulesEnabled, text: rulesText || undefined },
    });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'createError'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const country = i18n.language === 'pt-BR' ? 'BR' : 'PT';
      const id = await create.mutateAsync({ ...parsed.data, country });
      let warn = false;
      try {
        const thumbnail_path = thumbnailFile
          ? await uploadCommunityImage(thumbnailFile, id, 'community-thumbnails')
          : null;
        const cover_image_path = coverFile
          ? await uploadCommunityImage(coverFile, id, 'community-covers')
          : null;
        if (thumbnail_path || cover_image_path) {
          const { error: upErr } = await (supabase as unknown as TypedClient)
            .from('communities')
            .update({ thumbnail_path, cover_image_path })
            .eq('id', id);
          if (upErr) warn = true;
        }
      } catch {
        warn = true;
      }
      router.push(`/app/community/${id}/created${warn ? '?warn=1' : ''}`);
    } catch {
      setError(t('createError'));
    } finally {
      setBusy(false);
    }
  };

  if (canCreate.data === false) {
    return (
      <div className="p-6 max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">{t('notAllowed')}</p>
        <Button asChild variant="secondary">
          <Link href="/app/community">{t('title')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('createTitle')}</h1>

      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input
                id="name"
                value={name}
                placeholder={t('namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">{t('locationLabel')}</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('typeLabel')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as CommunityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="club">{t('typeClub')}</SelectItem>
                  <SelectItem value="team">{t('typeTeam')}</SelectItem>
                  <SelectItem value="friends">{t('typeFriends')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('privacyLabel')}</Label>
              <Select value={privacy} onValueChange={(v) => setPrivacy(v as Privacy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('privacyPublic')}</SelectItem>
                  <SelectItem value="request_to_join">{t('privacyRequest')}</SelectItem>
                  <SelectItem value="private">{t('privacyPrivate')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="thumbnail">{t('thumbnailLabel')}</Label>
              <input
                id="thumbnail"
                type="file"
                accept="image/*"
                onChange={(e) => onThumbnailChange(e.target.files?.[0] ?? null)}
              />
              {thumbnailPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnailPreview} alt="" className="h-24 w-24 rounded object-cover" />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover">{t('coverLabel')}</Label>
              <input
                id="cover"
                type="file"
                accept="image/*"
                onChange={(e) => onCoverChange(e.target.files?.[0] ?? null)}
              />
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" className="h-24 w-full rounded object-cover" />
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rules-toggle">{t('rulesToggle')}</Label>
              <Switch id="rules-toggle" checked={rulesEnabled} onCheckedChange={setRulesEnabled} />
            </div>
            {rulesEnabled ? (
              <div className="space-y-2">
                <Label htmlFor="rules-text">{t('rulesTextLabel')}</Label>
                <Textarea
                  id="rules-text"
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                />
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t('creating') : t('createCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
