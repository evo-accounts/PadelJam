import { useEffect, useState } from 'react';

/**
 * Current epoch milliseconds, refreshed every `intervalMs` (default 30s) so time-derived UI — the
 * join countdown, the join and leave deadlines — stays live. The web event page used to read the
 * clock once at mount, so its countdown froze and a page left open past a deadline kept offering
 * an action the server would refuse (B18). Mirrors mobile's `lib/useNow.ts`.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
