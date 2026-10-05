import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (Explore's typeahead waits ~150 ms, D7). */
export function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}
