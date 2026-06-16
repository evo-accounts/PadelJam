import { useEffect, useState } from 'react';

/**
 * Current epoch milliseconds, refreshed on a fixed interval (default 30s) so that
 * time-derived UI (countdowns, deadline states) stays live. Must be called
 * unconditionally with other hooks (Rules of Hooks); all deadline math stays pure.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
