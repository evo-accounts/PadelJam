'use client';
/**
 * The create/edit form for a group, shared by Create group and Group settings (UX-GRP-01/11 — the
 * same form). Web's twin of mobile's GroupComposer.
 *
 * The primary button stays enabled and validates on click, saying what is missing (UX-GLOB-06; the
 * product owner kept this over UX-GRP-01's "disabled until filled"): `aria-invalid` marks the name,
 * the message is tied to it with `aria-describedby`, and focus moves there so a screen reader
 * announces both. The thumbnail is optional and can be removed; the privacy toggle sits in a card
 * whose line says what it means.
 *
 * Uploading and the create/update call are the caller's: `onSubmit` receives the picked file.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export type GroupComposerValues = {
  name: string;
  description: string | undefined;
  isPrivate: boolean;
  /** Newly picked image to upload, or null when unchanged / unset. */
  file: File | null;
  /** The existing thumbnail was removed (edit mode): store none. */
  removeThumbnail: boolean;
};

export type GroupComposerInitial = {
  name?: string;
  description?: string | null;
  isPrivate?: boolean;
  /** Resolved public URL of the stored thumbnail, if any. */
  thumbnailUrl?: string | null;
};

export function GroupComposer({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  before,
  error,
}: {
  initial?: GroupComposerInitial;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: GroupComposerValues) => void;
  /** Rendered above the fields — Create group's community selector. */
  before?: ReactNode;
  /** A server error to show above the button. */
  error?: string | null;
}) {
  const { t } = useT('group');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
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
    if (f) setRemoved(false);
  };
  const removeThumbnail = () => {
    pick(null);
    setRemoved(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const shown = preview ?? (removed ? null : (initial?.thumbnailUrl ?? null));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }
    onSubmit({
      name: trimmed,
      description: description.trim() || undefined,
      isPrivate,
      file,
      removeThumbnail: removed && file == null,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {before}
      <div className="flex flex-col gap-2">
        <Label htmlFor="group-name">{t('nameLabel')}</Label>
        <Input
          id="group-name"
          ref={nameRef}
          value={name}
          placeholder={t('namePlaceholder')}
          maxLength={80}
          disabled={submitting}
          onChange={(e) => {
            setName(e.target.value);
            if (nameMissing) setNameMissing(false);
          }}
          aria-invalid={nameMissing || undefined}
          aria-describedby={nameMissing ? 'group-name-error' : undefined}
        />
        {nameMissing ? (
          <p id="group-name-error" className="text-sm text-destructive">
            {t('name_required')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="group-description">{t('descriptionLabel')}</Label>
        <Textarea
          id="group-description"
          value={description}
          placeholder={t('descriptionPlaceholder')}
          maxLength={2000}
          disabled={submitting}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="group-thumbnail">{t('thumbnailLabel')}</Label>
        <div className="flex items-center gap-4">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-16 rounded-lg object-cover" />
          ) : (
            <div className="size-16 rounded-lg bg-muted" aria-hidden />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => fileRef.current?.click()}>
              {shown ? t('changeImageCta') : t('uploadImageCta')}
            </Button>
            {shown ? (
              <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={removeThumbnail}>
                {t('removeImageCta')}
              </Button>
            ) : null}
          </div>
          <input
            id="group-thumbnail"
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {/* UX-GRP-01: the privacy toggle inside a card, its line saying what it means. */}
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="group-private">{t('privateToggleLabel')}</Label>
          <p className="text-xs text-muted-foreground">{t('privateHelp')}</p>
        </div>
        <Switch id="group-private" checked={isPrivate} disabled={submitting} onCheckedChange={setIsPrivate} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={submitting} data-testid="group-composer-submit">
        {submitLabel}
      </Button>
    </form>
  );
}
