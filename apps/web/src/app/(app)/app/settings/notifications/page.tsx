'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useMySettings, useUpdateSettings, type NotificationSettings } from '@padel/api';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

type Key = keyof NotificationSettings;

// UX-SET-04: each toggle says what it actually turns off. "WhatsApp" alone does not tell you
// whether switching it off stops match reminders or stops everything.
const ROWS: { key: Key; label: string; description: string }[] = [
  { key: 'notifications_push', label: 'notifPush', description: 'notifPushDescription' },
  { key: 'notifications_whatsapp', label: 'notifWhatsapp', description: 'notifWhatsappDescription' },
  { key: 'notifications_email', label: 'notifEmail', description: 'notifEmailDescription' },
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
              <div className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block">{t(row.label)}</span>
                  <span className="block text-muted-foreground">{t(row.description)}</span>
                </span>
                <Switch
                  checked={value(row.key)}
                  onCheckedChange={(next) => onToggle(row.key, next)}
                  aria-label={t(row.label)}
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
