'use client';

import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils';

/**
 * A minimal toast: web's counterpart of mobile's `useBanner`.
 *
 * Web had none — every screen reported success inline, which works for a form that stays on
 * screen but not for an action that navigates away (leave a group, create one, decline an
 * invitation): the confirmation has to survive the route change. The store is module-level and
 * `<Toaster />` is mounted once in the app layout, which client-side navigation never unmounts,
 * so `toast()` called just before `router.push()` is still showing on the next page.
 *
 * Deliberately tiny — one live region, auto-dismiss, no queue limits — rather than a library.
 */
export type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

const DURATION_MS = 4000;
const EMPTY: ToastItem[] = [];

let items: ToastItem[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, tone: ToastTone = 'success'): void {
  const id = nextId++;
  items = [...items, { id, message, tone }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, DURATION_MS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          className={cn(
            'pointer-events-auto max-w-md rounded-md border bg-background px-4 py-3 text-sm shadow-lg',
            t.tone === 'error' && 'border-destructive text-destructive',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
