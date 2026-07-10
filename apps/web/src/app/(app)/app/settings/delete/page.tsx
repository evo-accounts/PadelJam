'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { signOut } from '@padel/auth';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function DeleteAccountPage() {
  const { t } = useT('settings');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        setError(t('saveError'));
        return;
      }
      await signOut(supabase as unknown as TypedClient);
      router.replace('/auth');
    } catch {
      // The raw fetch above rejects (TypeError: Failed to fetch) on a network-level failure —
      // surface a retry-able error instead of an unhandled promise rejection.
      setError(t('saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('deleteWarningTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('deleteWarningBody')}</p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">{t('deleteAccount')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteWarningTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteWarningBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('deleteCancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={busy}>
              {t('deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
