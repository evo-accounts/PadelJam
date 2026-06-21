'use client';
import { useT } from '@padel/i18n';
export function StepIndicator({ stepIndex, total }: { stepIndex: number; total: number }) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {t('stepProgress', { current: stepIndex + 1, total })}
      </p>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </div>
    </div>
  );
}
