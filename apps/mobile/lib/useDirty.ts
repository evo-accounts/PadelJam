import { useMemo } from 'react';

const norm = (v: unknown) => (v == null ? '' : v);

/** True when any field differs from its initial value. Empty string, null and undefined are equal. */
export function isDirty<T extends Record<string, unknown>>(current: T, initial: T): boolean {
  return Object.keys({ ...initial, ...current }).some((k) => norm(current[k]) !== norm(initial[k]));
}

export function useDirty<T extends Record<string, unknown>>(current: T, initial: T): boolean {
  return useMemo(() => isDirty(current, initial), [current, initial]);
}
