import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { backTarget } from './backTarget';

export function useGoBack() {
  const router = useRouter();
  return useCallback(() => {
    const t = backTarget(router.canGoBack());
    if (t.kind === 'back') router.back();
    else router.replace(t.href as never);
  }, [router]);
}
