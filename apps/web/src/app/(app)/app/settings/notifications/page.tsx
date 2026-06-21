'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useMySettings, useUpdateSettings, type NotificationSettings } from '@padel/api';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

type Key = keyof NotificationSettings;

const ROWS: { key: Key; label: string }[] = [
  { key: 'notifications_push', label: 'notifPush' },
  { key: 'notifications_whatsapp', label: 'notifWhatsapp' },
  { key: 'notifications_email', label: 'notifEmail' },
];

export default function NotificationsPage() {
  const { t } = useT('settings');
  const q = useMySettings();
  const update = useUpdateSettings();

  // Optimistic per-key overrides layered on top of the query data. A key is present
  // here only while/after the user toggles it; the query value is the fallback.
  const [override, setOverride] = useState<Partial<NotificationSettings>>({});
  const [error, setError] = useState(false);

  if (q.isLoading) {
    return (
      <div className="p-6 max-w-md space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const value = (key: Key): boolean =>
    override[key] ?? q.data?.[key] ?? false;

  const onToggle = (key: Key, next: boolean) => {
    setError(false);
    setOverride((prev) => ({ ...prev, [key]: next })); // optimistic
    update.mutate(
      { [key]: next },
      {
        onError: () => {
          // Revert just this key back to the server value.
          setOverride((prev) => {
            const { [key]: _dropped, ...rest } = prev;
            return rest;
          });
          setError(true);
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('notifications')}</h1>

      <Card className="gap-0 py-0">
        <CardContent className="px-0 py-2">
          {ROWS.map((row, i) => (
            <div key={row.key}>
              {i > 0 ? <Separator /> : null}
              <div className="flex items-center justify-between px-6 py-3 text-sm">
                <span>{t(row.label)}</span>
                <Switch
                  checked={value(row.key)}
                  onCheckedChange={(next) => onToggle(row.key, next)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{t('saveError')}</p> : null}
    </div>
  );
}
