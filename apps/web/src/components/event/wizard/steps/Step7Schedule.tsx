'use client';
import { useT } from '@padel/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldError } from '../FieldError';
import type { StepProps } from '../types';

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const LEAD_DAYS = [3, 5, 7] as const;

export function Step7Schedule({ draft, patch, flagged, nowMs = 0 }: StepProps) {
  const { t } = useT('event');
  const series = draft.series;
  // Flagged fields stay marked only while still wrong, so fixing one clears it at once.
  const badStart =
    !!flagged && (!draft.startsAt || new Date(draft.startsAt).getTime() <= nowMs);
  const badDuration = !!flagged && !(draft.durationMinutes > 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor="event-starts-at">{t('startsAtLabel')}</Label>
        <Input
          id="event-starts-at"
          type="datetime-local"
          aria-invalid={badStart || undefined}
          aria-describedby={badStart ? 'event-starts-at-error' : undefined}
          value={toLocalInput(draft.startsAt)}
          onChange={(e) => patch({ startsAt: fromLocalInput(e.target.value) })}
        />
        <FieldError id="event-starts-at-error" show={badStart} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-duration">{t('durationLabel')}</Label>
        <Input
          id="event-duration"
          type="number"
          aria-invalid={badDuration || undefined}
          aria-describedby={badDuration ? 'event-duration-error' : undefined}
          value={draft.durationMinutes}
          onChange={(e) => patch({ durationMinutes: Number(e.target.value) || 0 })}
        />
        <FieldError id="event-duration-error" show={badDuration} />
      </div>
      <div className="flex items-center justify-between">
        <Label>{t('recurringToggle')}</Label>
        <Switch
          checked={series != null}
          onCheckedChange={(on) =>
            patch(
              on
                ? {
                    series: {
                      dayOfWeek: 1,
                      startTime: '18:00',
                      durationMinutes: draft.durationMinutes,
                      inviteLeadDays: 3,
                    },
                  }
                : { series: undefined },
            )
          }
        />
      </div>
      {series ? (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>{t('dayOfWeekLabel')}</Label>
            <Select
              value={String(series.dayOfWeek)}
              onValueChange={(value) => patch({ series: { ...series, dayOfWeek: Number(value) } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t(`day${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('startTimeLabel')}</Label>
            <Input
              type="time"
              value={series.startTime}
              onChange={(e) => patch({ series: { ...series, startTime: e.target.value } })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('durationLabel')}</Label>
            <Input
              type="number"
              value={series.durationMinutes}
              onChange={(e) =>
                patch({ series: { ...series, durationMinutes: Number(e.target.value) || 0 } })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>{t('inviteLeadLabel')}</Label>
            <Select
              value={String(series.inviteLeadDays)}
              onValueChange={(value) =>
                patch({ series: { ...series, inviteLeadDays: Number(value) as 3 | 5 | 7 } })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t(`leadDays${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
