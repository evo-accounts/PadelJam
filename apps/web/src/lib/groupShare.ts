/**
 * The group link on web, and the two ways the group screens pass it on (UX-GRP-06/08/09/10) —
 * the counterpart of mobile's `lib/groupShare.ts`. The link opens `/app/group/[id]`, which shows
 * a non-member the preview they are allowed to see (UX-GRP-02).
 *
 * "Share" uses the browser's own share sheet where there is one (Safari, mobile browsers, Chrome
 * on macOS/Windows) and otherwise copies, so the action never silently does nothing. Callers say
 * which happened, because "Link copied." is only true of the second.
 */
import { useSyncExternalStore } from 'react';

export function groupUrl(id: string): string {
  return `${window.location.origin}/app/group/${id}`;
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyGroupLink(id: string): Promise<void> {
  await copyText(groupUrl(id));
}

/** 'shared' via the browser's sheet (or the user dismissed it), 'copied' when it fell back. */
export async function shareText(title: string, text: string, url?: string): Promise<'shared' | 'copied'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
      // Anything else (not allowed in this context) falls through to copying.
    }
  }
  await copyText(url ? `${text}\n${url}` : text);
  return 'copied';
}

export function shareGroup(id: string, name: string): Promise<'shared' | 'copied'> {
  return shareText(name, name, groupUrl(id));
}

const noopSubscribe = () => () => {};

/** Whether the browser has a native share sheet — read after hydration, never during SSR. */
export function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false,
  );
}
