/**
 * A boolean the device remembers (AsyncStorage), e.g. the Events tab's "Show past events".
 *
 * Starts at `fallback` and adopts the stored value once it has been read, so the first frame never
 * waits on storage. Storage failures are ignored: the flag is a convenience, never state that
 * matters, and it simply behaves as not remembered.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useStoredFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(fallback);
  // A toggle made before the stored value arrives wins over it.
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!cancelled && !touched.current && (raw === 'true' || raw === 'false')) setValue(raw === 'true');
      })
      .catch(() => undefined);
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

  return [value, set];
}
