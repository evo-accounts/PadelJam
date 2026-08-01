'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { changePassword, useSession, type TypedClient } from '@padel/auth';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ChangePasswordPage() {
  const { t } = useT('settings');
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user.email;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (next !== confirm) {
      setError(t('passwordsDontMatch'));
      return;
    }
    if (!email) {
      setError(t('saveError'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await changePassword(supabase as unknown as TypedClient, email, current, next);
      if (!r.ok) {
        setError(r.reason === 'current_password_wrong' ? t('currentPasswordWrong') : t('saveError'));
        return;
      }
      setSuccess(true);
      router.push('/app/settings');
    } finally {
      setPending(false);
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('changePassword')}</h1>

      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">{t('currentPassword')}</Label>
              <Input
                id="current"
                type="password"
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  clearError();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">{t('newPassword')}</Label>
              <Input
                id="new"
                type="password"
                value={next}
                onChange={(e) => {
                  setNext(e.target.value);
                  clearError();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('confirmPassword')}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  clearError();
                }}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {success ? <p className="text-sm text-success-strong">{t('passwordChanged')}</p> : null}

            <Button type="submit" className="w-full" disabled={pending}>
              {t('save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
