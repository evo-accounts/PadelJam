import { useCallback, useState } from 'react';

/**
 * Pure: returns a copy of `errors` with `key` removed, or the same reference
 * when `key` was never set (so a caller that skips the update on an unchanged
 * result doesn't re-render for nothing).
 */
export function dropKey<K extends string>(
  errors: Partial<Record<K, string>>,
  key: K,
): Partial<Record<K, string>> {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

/**
 * Shared field-error state for forms that redden a `Field` on a failed submit
 * (UX-GLOB-06). Without `clear`, a corrected field stays red until the next
 * submit attempt instead of turning back to normal as the user retypes it.
 */
export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const clear = useCallback((key: K) => {
    setErrors((prev) => dropKey(prev, key));
  }, []);
  return { errors, setErrors, clear };
}
