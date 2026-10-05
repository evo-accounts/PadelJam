'use client';
/**
 * Change the account's mobile number (UX-SET-02, Requirements PR-12), mirroring the email page.
 *
 * The audit mentions verification only for email, but the number matters more: `profiles.phone` is
 * unique and phone OTP is a sign-in path, so an unverified change would hand the account to a
 * number nobody proved they hold.
 *
 * No country selector here. Mobile has `PhoneField`, which does the selector and the E.164
 * normalisation; web has no such component and inventing one for this screen would be a bigger
 * change than the audit asks for. The field takes E.164 directly and says so.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useRefreshMyProfile } from '@padel/api';
import { startPhoneChange, verifyPhoneChange, type TypedClient } from '@padel/auth';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** E.164: a leading +, a non-zero country digit, then up to fourteen more. */
const E164_RE = /^\+[1-9]\d{6,14}$/;

export default function ChangePhonePage() {
  const { t } = useT('profile');
  const router = useRouter();
  const refreshMyProfile = useRefreshMyProfile();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!E164_RE.test(newPhone.trim())) {
      setError(t('phoneInvalid'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: startErr } = await startPhoneChange(
        supabase as unknown as TypedClient,
        newPhone.trim(),
      );
      if (startErr) {
        setError(t('changePhoneFailed'));
        return;
      }
      setStep('code');
    } finally {
      setPending(false);
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setPending(true);
    setError(null);
    try {
      const { error: verifyErr } = await verifyPhoneChange(
        supabase as unknown as TypedClient,
        newPhone.trim(),
        code.trim(),
      );
      if (verifyErr) {
        setError(t('invalidCode'));
        return;
      }
      await refreshMyProfile();
      router.push('/app/settings/account');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t('changePhone')}</h1>
      <Card>
        <CardContent className="pt-6">
          {step === 'phone' ? (
            <form onSubmit={onSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('newPhoneLabel')}</Label>
                <Input
                  id="phone"
                  value={newPhone}
                  onChange={(e) => {
                    setNewPhone(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="+351912345678"
                  inputMode="tel"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={pending}>
                {t('sendCode')}
              </Button>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('codeSentTo')}</p>
              <div className="space-y-2">
                <Label htmlFor="code">{t('codeLabel')}</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (error) setError(null);
                  }}
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" disabled={pending}>
                {t('verify')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
