'use client';
/**
 * Send blast (UX-MEVT-18, decision 6) — the whole flow of the blast page: pick → compose → sent.
 *
 * Without customisation (can_customize_event_blast false): one Templates grid; a picked template is
 * sent as it is (title and message read-only — the server refuses anything else, B10). "Customize
 * your blast" is shown locked and opens the UpgradePrompt (UX-GLOB-10): a group event's community
 * plan, or the organizer's own account plan (Jammer+) on a group-less event.
 *
 * With customisation: tabs Templates / Your blasts. A template opens "Customize your blast" (Title,
 * Description editable) with a "Save blast" checkbox; a saved blast opens the same form and can be
 * sent, changed (Save changes) or deleted.
 *
 * Both: Send to (all / confirmed / invited / waiting list), Channels (Email, WhatsApp), Send. Email
 * goes out through send-blast (useSendBlast). WhatsApp is sent from the organizer's own WhatsApp
 * (D6): the tab is opened in the click (so no popup blocker stands in the way) and pointed at
 * `wa.me/?text=<share_text>` once the server returns the text.
 *
 * The preview image is a placeholder: templates carry no artwork yet (0124 nulled their keys) and
 * there is no blast-image bucket, so a custom image is not offered yet.
 */
import { useState } from 'react';
import { CheckCircle2, Lock, Megaphone, MoreHorizontal } from 'lucide-react';
import { useT } from '@padel/i18n';
import {
  BLAST_SEND_TO,
  useBlastTemplates,
  useCanCustomizeBlast,
  useDeleteSavedBlast,
  useSavedBlasts,
  useSendBlast,
  useUpdateSavedBlast,
  type BlastChannel,
  type BlastSendTo,
  type BlastTemplate,
  type SavedBlast,
} from '@padel/api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toaster';

const TITLE_MAX = 80;
const DESC_MAX = 1000;

type Source = { kind: 'template'; template: BlastTemplate } | { kind: 'saved'; saved: SavedBlast };

type Sent = { sentToCount: number; audienceCount: number; whatsappUrl: string | null; whatsappOpened: boolean };

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

function PreviewImage({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex aspect-video w-full items-center justify-center rounded-md bg-muted text-muted-foreground ${className}`}
      aria-hidden
    >
      <Megaphone className="size-8" />
    </div>
  );
}

export function BlastComposer({
  eventId,
  onLocked,
  onDone,
}: {
  eventId: string;
  /** Opens the UpgradePrompt (the page knows which plan applies). */
  onLocked: () => void;
  /** "OK" on the sent state. */
  onDone: () => void;
}) {
  const { t } = useT('event');
  const templates = useBlastTemplates();
  const canCustom = useCanCustomizeBlast(eventId);
  const custom = canCustom.data === true;
  const saved = useSavedBlasts(eventId, { enabled: custom });
  const send = useSendBlast(eventId);
  const updateSaved = useUpdateSavedBlast();
  const deleteSaved = useDeleteSavedBlast();

  const [tab, setTab] = useState<'templates' | 'saved'>('templates');
  const [source, setSource] = useState<Source | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sendTo, setSendTo] = useState<BlastSendTo>('all');
  const [channels, setChannels] = useState<BlastChannel[]>(['email']);
  const [saveBlast, setSaveBlast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [deleting, setDeleting] = useState<SavedBlast | null>(null);

  const errText = (x: unknown) =>
    t(x instanceof Error ? x.message : 'unknown_error', { defaultValue: t('unknown_error') });

  const open = (s: Source) => {
    const src = s.kind === 'template' ? s.template : s.saved;
    setSource(s);
    setTitle(src.title);
    setDescription(src.description);
    setSaveBlast(false);
    setError(null);
  };

  const toggleChannel = (c: BlastChannel, on: boolean) =>
    setChannels((cur) => (on ? [...new Set([...cur, c])] : cur.filter((x) => x !== c)));

  if (canCustom.isLoading || templates.isLoading) return <Skeleton className="h-60 w-full" />;

  // ---- Sent ---------------------------------------------------------------------------------
  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center" data-testid="blast-sent">
        <CheckCircle2 className="size-14 text-success-strong" aria-hidden />
        <h2 className="text-xl font-semibold">{t('blastSentTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {channels.includes('email') ? t('blastSentEmailBody', { count: sent.sentToCount }) : null}
          {channels.includes('email') && sent.whatsappUrl ? ' ' : null}
          {sent.whatsappUrl ? t('blastSentWhatsappBody') : null}
        </p>
        {sent.whatsappUrl && !sent.whatsappOpened ? (
          <Button asChild variant="secondary" size="sm">
            <a href={sent.whatsappUrl} target="_blank" rel="noopener noreferrer" data-testid="blast-open-whatsapp">
              {t('blastOpenWhatsapp')}
            </a>
          </Button>
        ) : null}
        <Button className="mt-2 min-w-32" onClick={onDone} data-testid="blast-sent-ok">
          {t('blastSentOk')}
        </Button>
      </div>
    );
  }

  // ---- Compose ------------------------------------------------------------------------------
  if (source) {
    const editable = custom;
    const fromSaved = source.kind === 'saved';
    const tpl = source.kind === 'template' ? source.template : null;
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    const valid =
      trimmedTitle.length > 0 &&
      trimmedTitle.length <= TITLE_MAX &&
      trimmedDesc.length > 0 &&
      trimmedDesc.length <= DESC_MAX &&
      channels.length > 0;
    const savedChanged =
      fromSaved && (trimmedTitle !== source.saved.title.trim() || trimmedDesc !== source.saved.description.trim());

    const onSend = async () => {
      setBusy(true);
      setError(null);
      // Opened inside the click so the browser allows it; pointed at wa.me once we have the text.
      const wa = channels.includes('whatsapp') ? window.open('about:blank', '_blank') : null;
      if (wa) wa.opener = null; // wa.me must not reach back into this page
      try {
        const res = await send.mutateAsync(
          editable
            ? {
                sourceTemplateId: tpl?.id ?? (fromSaved ? source.saved.source_template_id : null),
                title: trimmedTitle,
                description: trimmedDesc,
                imagePath: (tpl ?? (fromSaved ? source.saved : null))?.image_path ?? null,
                channels,
                sendTo,
                save: !fromSaved && saveBlast,
              }
            : {
                // Locked: the template as it is — the server fills the text (B10).
                sourceTemplateId: tpl?.id ?? null,
                title: null,
                description: null,
                imagePath: null,
                channels,
                sendTo,
              },
        );
        const url = res.shareText ? whatsappUrl(res.shareText) : null;
        let opened = false;
        if (url && wa && !wa.closed) {
          wa.location.href = url;
          opened = true;
        } else {
          wa?.close();
        }
        setSent({ sentToCount: res.sentToCount, audienceCount: res.audienceCount, whatsappUrl: url, whatsappOpened: opened });
      } catch (x) {
        wa?.close();
        setError(errText(x));
      } finally {
        setBusy(false);
      }
    };

    const onSaveChanges = async () => {
      if (!fromSaved) return;
      setBusy(true);
      setError(null);
      try {
        await updateSaved.mutateAsync({
          id: source.saved.id,
          title: trimmedTitle,
          description: trimmedDesc,
          imagePath: source.saved.image_path,
        });
        setSource({ kind: 'saved', saved: { ...source.saved, title: trimmedTitle, description: trimmedDesc } });
        toast(t('blastSavedChangesToast'));
      } catch (x) {
        setError(errText(x));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="flex flex-col gap-4" data-testid="blast-compose">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{editable ? t('blastCustomizeTitle') : t('blastTemplateTitle')}</h2>
          <Button variant="tertiary" size="sm" onClick={() => setSource(null)} data-testid="blast-back-to-templates">
            {fromSaved ? t('blastBackToSaved') : t('blastBackToTemplates')}
          </Button>
        </div>

        <PreviewImage className="max-w-sm" />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blast-title">{t('blastTitleLabel')}</Label>
          <Input
            id="blast-title"
            value={title}
            maxLength={TITLE_MAX}
            readOnly={!editable}
            aria-readonly={!editable}
            onChange={(ev) => setTitle(ev.target.value)}
            data-testid="blast-title"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blast-desc">{t('blastDescLabel')}</Label>
          <Textarea
            id="blast-desc"
            value={description}
            maxLength={DESC_MAX}
            readOnly={!editable}
            aria-readonly={!editable}
            rows={6}
            onChange={(ev) => setDescription(ev.target.value)}
            data-testid="blast-description"
          />
          {!editable ? (
            <p className="text-xs text-muted-foreground" data-testid="blast-locked-note">
              {t('blastLockedNote')}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blast-send-to">{t('blastSendToLabel')}</Label>
          <Select value={sendTo} onValueChange={(v) => setSendTo(v as BlastSendTo)}>
            <SelectTrigger id="blast-send-to" className="w-full sm:w-72" data-testid="blast-send-to">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLAST_SEND_TO.map((s) => (
                <SelectItem key={s} value={s} data-testid={`blast-send-to-${s}`}>
                  {t(`blastSendTo_${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t('blastChannelsLabel')}</legend>
          {(['email', 'whatsapp'] as const).map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channels.includes(c)}
                onChange={(ev) => toggleChannel(c, ev.target.checked)}
                data-testid={`blast-channel-${c}`}
              />
              {t(c === 'email' ? 'blastChannelEmail' : 'blastChannelWhatsapp')}
            </label>
          ))}
          {channels.length === 0 ? <p className="text-xs text-destructive">{t('blastChannelsRequired')}</p> : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-card px-4 py-3 sm:-mx-6 sm:px-6">
          {editable && !fromSaved ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveBlast}
                onChange={(ev) => setSaveBlast(ev.target.checked)}
                data-testid="blast-save"
              />
              {t('blastSaveCheckbox')}
            </label>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            {fromSaved ? (
              <Button
                variant="secondary"
                className="sm:flex-1"
                disabled={busy || !valid || !savedChanged}
                onClick={() => void onSaveChanges()}
                data-testid="blast-save-changes"
              >
                {t('blastSaveChanges')}
              </Button>
            ) : null}
            <Button className="sm:flex-1" disabled={busy || !valid} onClick={() => void onSend()} data-testid="blast-send">
              {t('blastSendCta')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Pick ---------------------------------------------------------------------------------
  const list = templates.data ?? [];
  const grid = (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="blast-templates">
      {list.map((tpl) => (
        <li key={tpl.id}>
          <Card className="flex h-full flex-col gap-2 p-3" data-testid={`blast-template-${tpl.id}`}>
            <PreviewImage />
            <p className="font-medium">{tpl.title}</p>
            <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{tpl.description}</p>
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => open({ kind: 'template', template: tpl })}
              data-testid={`blast-template-select-${tpl.id}`}
            >
              {t('blastSelectCta')}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );

  if (!custom) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onLocked}
          className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-left hover:bg-muted"
          data-testid="blast-customize-locked"
        >
          <Lock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{t('blastCustomizeTitle')}</span>
            <span className="text-xs text-muted-foreground">{t('blastCustomizeLockedBody')}</span>
          </span>
        </button>
        <h2 className="text-lg font-semibold">{t('blastTabTemplates')}</h2>
        {list.length === 0 ? <p className="text-sm text-muted-foreground">{t('blastTemplatesEmpty')}</p> : grid}
      </div>
    );
  }

  const savedList = saved.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'templates' | 'saved')}>
        <TabsList>
          <TabsTrigger value="templates" data-testid="blast-tab-templates">
            {t('blastTabTemplates')}
          </TabsTrigger>
          <TabsTrigger value="saved" data-testid="blast-tab-saved">
            {t('blastTabSaved')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'templates' ? (
        list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('blastTemplatesEmpty')}</p>
        ) : (
          grid
        )
      ) : saved.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : savedList.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed p-8 text-center" data-testid="blast-saved-empty">
          <p className="text-sm font-medium">{t('blastSavedEmptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('blastSavedEmptyBody')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="blast-saved-list">
          {savedList.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-row items-start gap-3 p-3" data-testid={`blast-saved-${s.id}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{s.description}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => open({ kind: 'saved', saved: s })} data-testid={`blast-saved-use-${s.id}`}>
                  {t('blastUseCta')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="tertiary" size="icon-sm" aria-label={t('blastSavedActions', { title: s.title })}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => open({ kind: 'saved', saved: s })}>{t('blastEditCta')}</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)} data-testid={`blast-saved-delete-${s.id}`}>
                      {t('blastDeleteCta')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={deleting != null} onOpenChange={(o) => (!o && !busy ? setDeleting(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('blastDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('blastDeleteBody', { title: deleting?.title ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              data-testid="blast-delete-confirm"
              onClick={() => {
                if (!deleting) return;
                setBusy(true);
                deleteSaved
                  .mutateAsync(deleting.id)
                  .then(() => {
                    setDeleting(null);
                    toast(t('blastDeletedToast'));
                  })
                  .catch((x: unknown) => toast(errText(x), 'error'))
                  .finally(() => setBusy(false));
              }}
            >
              {t('blastDeleteCta')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
