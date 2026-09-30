'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useCommunities, useCommunity, useSetCommunityLocation, useUpdateCommunity, type LocationPoint } from '@padel/api';
import { PlacePicker } from '@/components/community/PlacePicker';
import { parseEwkbPoint, samePoint } from '@/lib/geo-point';
import { uploadCommunityImage } from '@/lib/upload';
import { communityImageUrl } from '@/lib/community-images';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CommunityType = 'club' | 'team' | 'friends';
type Privacy = 'public' | 'request_to_join' | 'private';

export default function ManageSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useCommunities();
  const c = useCommunity(id);
  const update = useUpdateCommunity(id);
  const setLocationRpc = useSetCommunityLocation(id);
  const { t } = useT('community');

  const role = (mine.data ?? []).find((r) => r.community?.id === id)?.role;
  const isAdmin = role === 'admin';
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isAdmin) router.replace(`/app/community/${id}`);
  }, [mine.isLoading, mine.data, isAdmin, id, router]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [point, setPoint] = useState<LocationPoint | null>(null);
  const [type, setType] = useState<CommunityType>('club');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [rulesEnabled, setRulesEnabled] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed local form state from the loaded community exactly once.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !c.data) return;
    seeded.current = true;
    setName(c.data.name ?? '');
    setDescription(c.data.description ?? '');
    setLocation(c.data.location ?? '');
    setPoint(parseEwkbPoint(c.data.location_point));
    setType((c.data.type as CommunityType) ?? 'club');
    setPrivacy((c.data.privacy as Privacy) ?? 'public');
    setRulesEnabled(c.data.cancellation_rules_enabled ?? false);
    setRulesText(c.data.cancellation_rules_text ?? '');
  }, [c.data]);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    };
  }, [thumbPreview]);
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const onThumbChange = (file: File | null) => {
    setThumbPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setThumbFile(file);
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
    setBusy(true);
    setError(null);
    let thumbnail_path: string | undefined,
      cover_image_path: string | undefined;
    try {
      if (thumbFile) thumbnail_path = await uploadCommunityImage(thumbFile, id, 'community-thumbnails');
      if (coverFile) cover_image_path = await uploadCommunityImage(coverFile, id, 'community-covers');
    } catch {
      // Image upload failed; proceed to save the rest of the settings.
    }
    // The place (D2) is written apart from the rest: label and point go together through
    // set_community_location, and only when one of them changed.
    const label = location.trim();
    const placeChanged =
      label !== (c.data?.location ?? '') || !samePoint(point, parseEwkbPoint(c.data?.location_point));
    try {
      if (placeChanged) await setLocationRpc.mutateAsync({ location: label || null, point });
    } catch (err) {
      setError(t(err instanceof Error && err.message === 'invalid_location' ? 'invalid_location' : 'saveError'));
      setBusy(false);
      return;
    }
    try {
      await update.mutateAsync({
        name,
        description: description || null,
        type,
        privacy,
        cancellation_rules_enabled: rulesEnabled,
        cancellation_rules_text: rulesEnabled ? rulesText || null : null,
        ...(thumbnail_path ? { thumbnail_path } : {}),
        ...(cover_image_path ? { cover_image_path } : {}),
      });
      router.push(`/app/community/${id}`);
    } catch {
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  };

  if (c.isLoading || mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isAdmin || !c.data) return null;

  const currentThumb = communityImageUrl(c.data.thumbnail_path, 'community-thumbnails');
  const currentCover = communityImageUrl(c.data.cover_image_path, 'community-covers');

  return (
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('manageSettingsTitle')}</h1>

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
              <PlacePicker
                id="location"
                value={{ label: location, point }}
                onLabelChange={setLocation}
                onPointChange={setPoint}
              />
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
                className="max-w-full"
                accept="image/*"
                onChange={(e) => onThumbChange(e.target.files?.[0] ?? null)}
              />
              {thumbPreview ?? currentThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbPreview ?? currentThumb ?? undefined}
                  alt=""
                  className="h-24 w-24 rounded object-cover"
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover">{t('coverLabel')}</Label>
              <input
                id="cover"
                type="file"
                className="max-w-full"
                accept="image/*"
                onChange={(e) => onCoverChange(e.target.files?.[0] ?? null)}
              />
              {coverPreview ?? currentCover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPreview ?? currentCover ?? undefined}
                  alt=""
                  className="h-24 w-full rounded object-cover"
                />
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
              {busy ? t('saving') : t('saveCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
