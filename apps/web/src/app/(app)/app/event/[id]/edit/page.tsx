'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent,
  useUpdateEvent,
  updateEventSchema,
  SCORING_MODES,
  ENTRANCE_FEE_METHODS,
  ORGANIZER_ROLES,
  type UpdateEventInput,
  type EntranceFeeMethod,
  type OrganizerRole,
  type ScoringMode,
} from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
import { supabase } from '@/lib/supabase/client';
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

const eventThumbUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  return supabase.storage.from('event-thumbnails').getPublicUrl(path).data.publicUrl;
};

type FeeState = {
  enabled: boolean;
  amount?: number;
  method?: EntranceFeeMethod;
  mbaNumber?: string;
};

export default function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const event = useEvent(id);
  const update = useUpdateEvent(id);

  // ---- form state ----
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState<string | undefined>(undefined);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [scoringMode, setScoringMode] = useState<ScoringMode>('classic');
  const [scoringValue, setScoringValue] = useState<number | null>(null);
  const [allowStandby, setAllowStandby] = useState(false);
  const [standbySpots, setStandbySpots] = useState<number | undefined>(undefined);
  const [isPrivate, setIsPrivate] = useState(false);
  const [fee, setFee] = useState<FeeState>({ enabled: false });
  const [playersSubmitResults, setPlayersSubmitResults] = useState(false);
  const [organizerRole, setOrganizerRole] = useState<OrganizerRole>('organizing_and_playing');
  const [manualLocationName, setManualLocationName] = useState<string | undefined>(undefined);
  const [manualLocationAddress, setManualLocationAddress] = useState<string | undefined>(undefined);
  const [venueId, setVenueId] = useState<string | undefined>(undefined);
  const [hasLocation, setHasLocation] = useState(false);
  const [numCourts, setNumCourts] = useState(1);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Organizer gate: redirect non-organizers to the read view.
  const e = event.data;
  const forbidden = !!e && !!uid && e.organizer_id !== uid;
  useEffect(() => {
    if (forbidden) router.replace(`/app/event/${id}`);
  }, [forbidden, id, router]);

  // Seed local form state ONCE from the loaded event (snake -> camel).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !e) return;
    seeded.current = true;
    setName(e.name ?? '');
    setDescription(e.description ?? '');
    setStartsAt(e.starts_at ?? undefined);
    setDurationMinutes(e.duration_minutes ?? 0);
    setScoringMode(e.scoring_mode as ScoringMode);
    setScoringValue(e.scoring_value);
    setAllowStandby(e.allow_standby ?? false);
    setStandbySpots(e.standby_spots ?? undefined);
    setIsPrivate(e.is_private ?? false);
    setFee({
      enabled: e.entrance_fee_enabled ?? false,
      amount: e.entrance_fee_amount ?? undefined,
      method: (e.entrance_fee_method as EntranceFeeMethod | null) ?? undefined,
      mbaNumber: e.entrance_fee_mba_number ?? undefined,
    });
    setPlayersSubmitResults(e.players_submit_results ?? false);
    setOrganizerRole(e.organizer_role as OrganizerRole);
    setManualLocationName(e.manual_location_name ?? undefined);
    setManualLocationAddress(e.manual_location_address ?? undefined);
    setVenueId(e.venue_id ?? undefined);
    setHasLocation(e.has_location ?? false);
    setNumCourts(e.num_courts ?? 1);
  }, [e]);

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

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!e) return <div className="p-6">{t('notAvailable')}</div>;
  if (forbidden) return null;

  const currentThumb = eventThumbUrl(e.thumbnail_path);

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);

    let thumbnailPath: string | undefined = e.thumbnail_path ?? undefined;
    if (file && uid) {
      try {
        thumbnailPath = await uploadCommunityImage(file, uid, 'event-thumbnails');
      } catch {
        /* non-fatal: keep existing thumbnail */
      }
    }

    const values: UpdateEventInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      thumbnailPath,
      startsAt: startsAt ?? '',
      durationMinutes,
      scoringMode,
      scoringValue: scoringMode === 'classic' ? null : scoringValue,
      allowStandby,
      standbySpots: allowStandby ? standbySpots : undefined,
      isPrivate,
      entranceFee: fee.enabled
        ? {
            enabled: true,
            amount: fee.amount,
            method: fee.method,
            mbaNumber: fee.method === 'mba' ? fee.mbaNumber : undefined,
          }
        : { enabled: false },
      playersSubmitResults,
      organizerRole,
      manualLocationName: venueId ? undefined : manualLocationName,
      manualLocationAddress: venueId ? undefined : manualLocationAddress,
      venueId,
      hasLocation,
      numCourts,
    };

    const parsed = updateEventSchema.safeParse(values);
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'unknown_error'));
      setBusy(false);
      return;
    }

    try {
      await update.mutateAsync({ values: parsed.data, groupId: e.group_id });
      router.push(`/app/event/${id}`);
    } catch (err) {
      setError(t(err instanceof Error ? err.message : 'unknown_error'));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
      <Card>
        <CardContent className="py-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t('nameLabel')}</Label>
              <Input
                id="name"
                value={name}
                maxLength={80}
                placeholder={t('namePlaceholder')}
                onChange={(ev) => setName(ev.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={description}
                maxLength={500}
                onChange={(ev) => setDescription(ev.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="thumbnail">{t('thumbnailLabel')}</Label>
              <input
                id="thumbnail"
                type="file"
                accept="image/*"
                onChange={(ev) => onFileChange(ev.target.files?.[0] ?? null)}
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

            <div className="space-y-2">
              <Label htmlFor="startsAt">{t('startsAtLabel')}</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                value={toLocalInput(startsAt)}
                onChange={(ev) => setStartsAt(fromLocalInput(ev.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">{t('durationLabel')}</Label>
              <Input
                id="duration"
                type="number"
                value={durationMinutes}
                onChange={(ev) => setDurationMinutes(Number(ev.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('scoringLabel')}</Label>
              <Select value={scoringMode} onValueChange={(v) => setScoringMode(v as ScoringMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORING_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`scoring${cap(m)}Label`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scoringMode !== 'classic' ? (
              <div className="space-y-2">
                <Label htmlFor="scoringValue">{t('scoringValueLabel')}</Label>
                <Input
                  id="scoringValue"
                  type="number"
                  value={scoringValue ?? ''}
                  onChange={(ev) => setScoringValue(Number(ev.target.value) || null)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="courts">{t('courtsLabel')}</Label>
              <Input
                id="courts"
                type="number"
                min={1}
                value={numCourts}
                onChange={(ev) => setNumCourts(Number(ev.target.value) || 1)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t('standbyToggle')}</Label>
              <Switch checked={allowStandby} onCheckedChange={setAllowStandby} />
            </div>
            {allowStandby ? (
              <div className="space-y-2">
                <Label htmlFor="standbySpots">{t('standbySpotsLabel')}</Label>
                <Input
                  id="standbySpots"
                  type="number"
                  value={standbySpots ?? ''}
                  onChange={(ev) => setStandbySpots(Number(ev.target.value) || undefined)}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <Label>{t('privateToggle')}</Label>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>

            <div className="flex items-center justify-between">
              <Label>{t('feeToggle')}</Label>
              <Switch
                checked={fee.enabled}
                onCheckedChange={(on) => setFee((f) => ({ ...f, enabled: on }))}
              />
            </div>
            {fee.enabled ? (
              <div className="flex flex-col gap-4 rounded-lg border p-4">
                <div className="space-y-2">
                  <Label>{t('feeAmountLabel')}</Label>
                  <Input
                    type="number"
                    value={fee.amount ?? ''}
                    onChange={(ev) =>
                      setFee((f) => ({ ...f, amount: Number(ev.target.value) || undefined }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('feeMethodLabel')}</Label>
                  <Select
                    value={fee.method ?? ''}
                    onValueChange={(v) => setFee((f) => ({ ...f, method: v as EntranceFeeMethod }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRANCE_FEE_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`fee${cap(m)}Label`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {fee.method === 'mba' ? (
                  <div className="space-y-2">
                    <Label>{t('feeMbaNumberLabel')}</Label>
                    <Input
                      value={fee.mbaNumber ?? ''}
                      onChange={(ev) => setFee((f) => ({ ...f, mbaNumber: ev.target.value }))}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <Label>{t('playersSubmitToggle')}</Label>
              <Switch checked={playersSubmitResults} onCheckedChange={setPlayersSubmitResults} />
            </div>

            <div className="space-y-2">
              <Label>{t('organizerRoleLabel')}</Label>
              <Select
                value={organizerRole}
                onValueChange={(v) => setOrganizerRole(v as OrganizerRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORGANIZER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`role${cap(r)}Label`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!venueId && hasLocation ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="locName">{t('locationNameLabel')}</Label>
                  <Input
                    id="locName"
                    value={manualLocationName ?? ''}
                    onChange={(ev) => setManualLocationName(ev.target.value || undefined)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locAddress">{t('locationAddressLabel')}</Label>
                  <Input
                    id="locAddress"
                    value={manualLocationAddress ?? ''}
                    onChange={(ev) => setManualLocationAddress(ev.target.value || undefined)}
                  />
                </div>
              </>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {t('saveCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
