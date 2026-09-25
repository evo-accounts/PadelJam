'use client';
import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StepProps } from '../types';

type Step9Props = StepProps & {
  onThumbnail: (f: File | null) => void;
  thumbFile: File | null;
};

export function Step9Details({ draft, patch, onThumbnail, thumbFile }: Step9Props) {
  const { t } = useT('event');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(thumbFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbFile]);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label>{t('nameLabel')}</Label>
        <Input
          maxLength={80}
          placeholder={t('namePlaceholder')}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('descriptionLabel')}</Label>
        <Textarea
          maxLength={500}
          value={draft.description ?? ''}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('thumbnailLabel')}</Label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onThumbnail(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-24 w-24 rounded object-cover" />
        ) : null}
      </div>
    </div>
  );
}
