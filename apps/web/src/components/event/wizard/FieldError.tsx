'use client';
import { useT } from '@padel/i18n';

/**
 * "Required" under a field the primary button flagged (UX-GLOB-06). The field points at it with
 * `aria-describedby`, so a screen reader reads the field and its error together.
 */
export function FieldError({ id, show }: { id: string; show: boolean }) {
  const { t } = useT('common');
  return show ? (
    <p id={id} className="text-sm text-destructive">
      {t('required')}
    </p>
  ) : null;
}
