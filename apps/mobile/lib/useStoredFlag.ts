/**
 * A boolean the device remembers (AsyncStorage), e.g. the Events tab's "Show past events".
 *
 * Starts at `fallback` and adopts the stored value once it has been read. `hydrated` turns true
 * once that read has settled (found, missing or failed), so a caller whose fetch depends on the
 * flag can wait for it rather than fetch with the fallback and then again with the stored value.
 * Storage failures are ignored: the flag is a convenience and simply behaves as not remembered.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useStoredFlag(
  key: string,
  fallback: boolean,
): [value: boolean, set: (next: boolean) => void, hydrated: boolean] {
  const [value, setValue] = useState(fallback);
  const [hydrated, setHydrated] = useState(false);
  // A toggle made before the stored value arrives wins over it.
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!cancelled && !touched.current && (raw === 'true' || raw === 'false')) setValue(raw === 'true');
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const set = useCallback(
    (next: boolean) => {
      touched.current = true;
      setValue(next);
      AsyncStorage.setItem(key, String(next)).catch(() => undefined);
    },
    [key],
  );

  return [value, set, hydrated];
}
