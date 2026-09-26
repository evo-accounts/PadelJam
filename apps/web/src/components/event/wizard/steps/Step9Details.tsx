'use client';
import { useT } from '@padel/i18n';
import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { detailsErrors } from '../draft-logic';
import { FieldError } from '../FieldError';
import type { StepProps } from '../types';

type Step9Props = StepProps & {
  onThumbnail: (f: File | null) => void;
  /** The picked file's object URL; the page owns it (and releases it) along with the file. */
  thumbPreview: string | null;
};

/**
 * Details (UX-CEVT-10): name, description and the thumbnail — the same `ImagePickerRow` as Create
 * Group, with change and remove once an image is set. Presets are blocked on artwork (decision 15),
 * so the row is upload only. The file is uploaded when the event is created.
 */
export function Step9Details({ draft, patch, flagged, onThumbnail, thumbPreview }: Step9Props) {
  const { t } = useT('event');
  const badName = !!flagged && detailsErrors(draft).includes('name');

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="event-name">{t('nameLabel')}</Label>
        <Input
          id="event-name"
          maxLength={80}
          aria-invalid={badName || undefined}
          aria-describedby={badName ? 'event-name-error' : undefined}
          placeholder={t('namePlaceholder')}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          data-testid="event-details-name"
        />
        <FieldError id="event-name-error" show={badName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-description">{t('descriptionLabel')}</Label>
        <Textarea
          id="event-description"
          maxLength={500}
          placeholder={t('descriptionPlaceholder')}
          value={draft.description ?? ''}
          onChange={(e) => patch({ description: e.target.value || undefined })}
          data-testid="event-details-description"
        />
      </div>
      <ImagePickerRow
        id="event-thumbnail"
        label={t('thumbnailLabel')}
        previewUrl={thumbPreview}
        onPick={onThumbnail}
        onRemove={() => onThumbnail(null)}
        labels={{ upload: t('uploadImageCta'), change: t('changeImageCta'), remove: t('removeImageCta') }}
        testId="event-thumbnail"
      />
    </div>
  );
}
