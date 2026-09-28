'use client';
/**
 * Create / edit a registry venue (super admin, UX events plan decision 3): name, address, image,
 * and its courts — added, renamed, reordered, removed — saved in one `save_venue` call. Editing
 * also offers "Delete venue", a soft delete: past events keep their location.
 *
 * A court an event already used cannot be removed (`court_in_use`); the whole save is rejected
 * and the form stays as it was, so nothing is half-written.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowLeft, ArrowUp, MapPin, Plus, Trash2 } from 'lucide-react';
import { useDeleteVenue, useSaveVenue, useVenue, useVenueCourts, type VenueCourt, type VenueDetail } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { removeVenueImage, uploadVenueImage, venueImageUrl } from '@/lib/upload';

const LIST = '/super-admin/venues';

export function VenueForm({ venueId }: { venueId: string | null }) {
  const { t } = useT('superAdmin');
  const venue = useVenue(venueId);
  const courts = useVenueCourts(venueId);

  if (!venueId) return <VenueFormBody venue={null} courts={[]} />;
  if (venue.isLoading || courts.isLoading) return <Skeleton className="m-6 h-64" />;
  if (!venue.data || venue.data.deleted_at) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
        <Title title={t('editVenueTitle')} />
        <p role="alert" className="rounded-lg border p-4 text-sm">
          {t('notFound')}
        </p>
      </div>
    );
  }
  return <VenueFormBody venue={venue.data} courts={courts.data ?? []} />;
}

function Title({ title }: { title: string }) {
  const { t } = useT('superAdmin');
  return (
    <div className="flex items-center gap-3">
      <Button variant="tertiary" size="icon" asChild aria-label={t('back')}>
        <Link href={LIST}>
          <ArrowLeft />
        </Link>
      </Button>
      <h1 className="truncate text-xl font-semibold">{title}</h1>
    </div>
  );
}

type CourtRow = { key: string; id: string | null; name: string };

function VenueFormBody({ venue, courts: initialCourts }: { venue: VenueDetail | null; courts: VenueCourt[] }) {
  const { t } = useT('superAdmin');
  const router = useRouter();
  const save = useSaveVenue();
  const remove = useDeleteVenue();

  const [name, setName] = useState(venue?.name ?? '');
  const [address, setAddress] = useState(venue?.address ?? '');
  const [courts, setCourts] = useState<CourtRow[]>(() =>
    initialCourts.map((c) => ({ key: c.id, id: c.id, name: c.name })),
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (f: File | null) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    setFile(f);
    if (f) setImageRemoved(false);
  };
  const removeImage = () => {
    pick(null);
    setImageRemoved(true);
    if (fileRef.current) fileRef.current.value = '';
  };
  const shownImage = preview ?? (imageRemoved ? null : venueImageUrl(venue?.image_path));

  const addCourt = () =>
    setCourts((cs) => [
      ...cs,
      { key: crypto.randomUUID(), id: null, name: t('defaultCourtName', { n: cs.length + 1 }) },
    ]);
  const renameCourt = (key: string, value: string) =>
    setCourts((cs) => cs.map((c) => (c.key === key ? { ...c, name: value } : c)));
  const moveCourt = (index: number, delta: -1 | 1) =>
    setCourts((cs) => {
      const next = [...cs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cs;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const removeCourt = (key: string) => setCourts((cs) => cs.filter((c) => c.key !== key));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }
    if (courts.some((c) => !c.name.trim())) {
      setError(t('court_name_required'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const oldPath = venue?.image_path ?? null;
    let uploaded: string | null = null;
    try {
      if (file) uploaded = await uploadVenueImage(file);
      const imagePath = uploaded ?? (imageRemoved ? null : oldPath);
      await save.mutateAsync({
        id: venue?.id ?? null,
        name: trimmed,
        address: address.trim() || null,
        imagePath,
        courts: courts.map((c) => ({ id: c.id, name: c.name.trim() })),
      });
      if (oldPath && oldPath !== imagePath) void removeVenueImage(oldPath);
      toast(venue ? t('savedToast') : t('createdToast'));
      router.replace(LIST);
    } catch (err) {
      if (uploaded) void removeVenueImage(uploaded);
      const code = err instanceof Error ? err.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!venue) return;
    try {
      await remove.mutateAsync(venue.id);
      toast(t('deletedToast'));
      router.replace(LIST);
    } catch (err) {
      setConfirmDelete(false);
      const code = err instanceof Error ? err.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4">
      <Title title={venue ? t('editVenueTitle') : t('newVenueTitle')} />
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="venue-name">{t('nameLabel')}</Label>
          <Input
            id="venue-name"
            ref={nameRef}
            value={name}
            placeholder={t('namePlaceholder')}
            maxLength={120}
            disabled={submitting}
            onChange={(e) => {
              setName(e.target.value);
              if (nameMissing) setNameMissing(false);
            }}
            aria-invalid={nameMissing || undefined}
            aria-describedby={nameMissing ? 'venue-name-error' : undefined}
          />
          {nameMissing ? (
            <p id="venue-name-error" className="text-sm text-destructive">
              {t('name_required')}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="venue-address">{t('addressLabel')}</Label>
          <Input
            id="venue-address"
            value={address}
            placeholder={t('addressPlaceholder')}
            maxLength={300}
            disabled={submitting}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="venue-image">{t('imageLabel')}</Label>
          <div className="flex items-center gap-4">
            {shownImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownImage} alt="" className="h-20 w-32 rounded-lg object-cover" />
            ) : (
              <div className="flex h-20 w-32 items-center justify-center rounded-lg bg-muted" aria-hidden>
                <MapPin className="size-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={() => fileRef.current?.click()}>
                {shownImage ? t('changeImage') : t('uploadImage')}
              </Button>
              {shownImage ? (
                <Button type="button" variant="tertiary" size="sm" disabled={submitting} onClick={removeImage}>
                  {t('removeImage')}
                </Button>
              ) : null}
            </div>
            <input
              id="venue-image"
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{t('courtsLabel')}</legend>
          <p className="text-xs text-muted-foreground">{t('courtsHelp')}</p>
          {courts.length === 0 ? <p className="text-sm text-muted-foreground">{t('noCourts')}</p> : null}
          <ol className="flex flex-col gap-2" data-testid="venue-courts">
            {courts.map((c, i) => {
              const label = c.name.trim() || t('defaultCourtName', { n: i + 1 });
              return (
                <li key={c.key} className="flex items-center gap-2">
                  <span className="w-6 text-right text-sm text-muted-foreground" aria-hidden>
                    {i + 1}
                  </span>
                  <Input
                    value={c.name}
                    maxLength={60}
                    disabled={submitting}
                    aria-label={t('courtNameLabel', { n: i + 1 })}
                    aria-invalid={!c.name.trim() || undefined}
                    onChange={(e) => renameCourt(c.key, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    disabled={submitting || i === 0}
                    aria-label={t('moveUp', { name: label })}
                    onClick={() => moveCourt(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    disabled={submitting || i === courts.length - 1}
                    aria-label={t('moveDown', { name: label })}
                    onClick={() => moveCourt(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon"
                    disabled={submitting}
                    aria-label={t('removeCourt', { name: label })}
                    onClick={() => removeCourt(c.key)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button type="button" variant="secondary" size="sm" className="self-start" disabled={submitting} onClick={addCourt}>
            <Plus />
            {t('addCourt')}
          </Button>
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={submitting} data-testid="venue-form-submit">
          {venue ? t('save') : t('create')}
        </Button>
        {venue ? (
          <Button
            type="button"
            variant="tertiary"
            className="w-full text-destructive"
            disabled={submitting}
            onClick={() => setConfirmDelete(true)}
          >
            {t('deleteVenue')}
          </Button>
        ) : null}
      </form>

      <GroupConfirm
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('deleteTitle')}
        body={t('deleteBody')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        destructive
        busy={remove.isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
