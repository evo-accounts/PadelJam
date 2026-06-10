'use client';

import { useAuthFlow } from '@/lib/useAuthFlow';
import { IdentifierStep } from '@/components/auth/IdentifierStep';
import { OtpStep } from '@/components/auth/OtpStep';
import { CreateAccountStep } from '@/components/auth/CreateAccountStep';

export default function AuthPage() {
  const flow = useAuthFlow();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6 py-12">
      {flow.step === 'identifier' ? <IdentifierStep flow={flow} /> : null}
      {flow.step === 'otp' ? <OtpStep flow={flow} /> : null}
      {flow.step === 'createAccount' ? <CreateAccountStep flow={flow} /> : null}
    </main>
  );
}
