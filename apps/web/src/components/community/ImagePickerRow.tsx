'use client';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * The image field shared by Create Group / Group settings and Create Event's Details (UX-CEVT-10,
 * web's twin of mobile's `ImagePickerRow`): a preview, "Upload image" — "Change image" once one is
 * set — and "Remove image". Upload only: preset images are blocked on artwork (decision 15).
 *
 * The caller owns the file and its preview URL; this row only reports what was picked or removed.
 */
export function ImagePickerRow({
  id,
  label,
  previewUrl,
  onPick,
  onRemove,
  disabled,
  labels,
  testId,
}: {
  id: string;
  label: string;
  /** What to show: the picked file's object URL, or the stored image's public URL. */
  previewUrl: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
  labels: { upload: string; change: string; remove: string };
  testId?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-4">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="size-16 rounded-lg object-cover" data-testid={testId ? `${testId}-preview` : undefined} />
        ) : (
          <div className="size-16 rounded-lg bg-muted" aria-hidden />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            data-testid={testId ? `${testId}-pick` : undefined}
          >
            {previewUrl ? labels.change : labels.upload}
          </Button>
          {previewUrl ? (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              disabled={disabled}
              onClick={() => {
                if (fileRef.current) fileRef.current.value = '';
                onRemove();
              }}
              data-testid={testId ? `${testId}-remove` : undefined}
            >
              {labels.remove}
            </Button>
          ) : null}
        </div>
        <input
          id={id}
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          data-testid={testId ? `${testId}-input` : undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
      </div>
    </div>
  );
}
