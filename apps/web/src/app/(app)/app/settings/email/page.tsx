'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { startEmailChange, verifyEmailChange, type TypedClient } from '@padel/auth';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmailPage() {
  const { t } = useT('settings');
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const clearError = () => {
    if (error) setError(null);
  };

  const onSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(newEmail)) {
      setError(t('emailInvalid'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: startErr } = await startEmailChange(supabase as unknown as TypedClient, newEmail);
      if (startErr) {
        setError(t('saveError'));
        return;
      }
      setStep('code');
    } finally {
      setPending(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { error: verifyErr } = await verifyEmailChange(
        supabase as unknown as TypedClient,
        newEmail,
        code,
      );
      if (verifyErr) {
        setError(t('invalidCode'));
        return;
      }
      setSuccess(true);
      router.push('/app/settings');
    } finally {
      setPending(false);
    }
  };

  const onBack = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('changeEmail')}</h1>

      <Card>
        <CardContent>
          {step === 'email' ? (
            <form onSubmit={onSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newEmail">{t('newEmail')}</Label>
                <Input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    clearError();
                  }}
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button type="submit" className="w-full" disabled={pending}>
                {t('sendCode')}
              </Button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('codeSentTo', { email: newEmail })}</p>
              <div className="space-y-2">
                <Label htmlFor="code">{t('codeLabel')}</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    clearError();
                  }}
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {success ? <p className="text-sm text-success-strong">{t('emailChanged')}</p> : null}

              <Button type="submit" className="w-full" disabled={pending}>
                {t('save')}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={onBack} disabled={pending}>
                {t('back')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
