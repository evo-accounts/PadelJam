'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@padel/i18n';
import { useCreatePost } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { uploadPostImage } from '@/lib/upload';

export function PostComposer({
  communityId,
  canPost,
}: {
  communityId: string;
  canPost: boolean;
}) {
  const { t } = useT('community');
  const create = useCreatePost(communityId);
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!canPost) return null;

  const disabled = busy || body.trim().length === 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let imagePath: string | undefined;
      if (file) imagePath = await uploadPostImage(file, communityId);
      await create.mutateAsync({ body, imagePath });
      setBody('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        placeholder={t('postPlaceholder')}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={busy}
      />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="max-h-48 w-full rounded-md object-cover" />
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <label className="cursor-pointer text-sm text-muted-foreground">
          {t('addPhoto')}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button onClick={submit} disabled={disabled}>
          {busy ? t('posting') : t('post')}
        </Button>
      </div>
    </div>
  );
}
