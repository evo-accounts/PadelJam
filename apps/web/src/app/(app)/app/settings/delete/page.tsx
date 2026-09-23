'use client';
/**
 * Delete account (UX-SET-11), mirrored on web.
 *
 * Same shape as mobile: a warning card with a red accent, a card listing what is removed, a
 * destructive action, and a final confirmation. Web uses `AlertDialog` where mobile uses a sheet —
 * it is the platform's own "are you sure", and it already guarded this action before.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { signOut } from '@padel/auth';
import type { TypedClient } from '@padel/db';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
        /**
         * Migration 0098 refuses to delete the sole admin of a community — it would strand the
         * community with nobody able to manage it — and the edge function returns that message
         * verbatim. Reporting it as a generic failure tells the user to retry something that can
         * never succeed.
         */
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
        setError(
          body?.error?.includes('last_admin_must_promote_first')
            ? t('deleteBlockedSoleAdmin')
            : t('saveError'),
        );
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

  const removed = [
    t('deleteErasedProfile'),
    t('deleteErasedHistory'),
    t('deleteErasedMessages'),
    t('deleteErasedPayment'),
    t('deleteErasedOther'),
  ];

  return (
    <div className="max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t('deleteAccount')}</h1>

      {/* The accent is a border, not a fill: a solid destructive block behind body text fails
          contrast, and the audit asks for an accent rather than a slab. */}
      <Card className="border-destructive">
        <CardContent className="space-y-2 pt-6">
          <p className="font-medium text-destructive">{t('deleteWarningTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('deleteWarningBody')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <p className="text-sm font-medium">{t('deleteListTitle')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {removed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            {t('deleteConfirm')}
          </Button>
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
