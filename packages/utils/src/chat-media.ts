export type MsgLike = {
  id: string;
  text?: string | null;
  type?: string | null;
  attachments?: { type?: string | null; image_url?: string | null; asset_url?: string | null }[] | null;
};

/** Image URLs from one ascending (oldest→newest) Stream page, returned NEWEST-FIRST. */
export function extractImageUrls(messages: MsgLike[]): string[] {
  const urls: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const a of messages[i]?.attachments ?? []) {
      if (a?.type === 'image') {
        const u = a.image_url ?? a.asset_url;
        if (u) urls.push(u);
      }
    }
  }
  return urls;
}

/** Concatenate a new page after existing, de-duplicating URLs (preserve first-seen order). */
export function appendImages(existing: string[], page: string[]): string[] {
  const seen = new Set(existing);
  const out = existing.slice();
  for (const u of page) {
    if (!seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

/** Oldest message id in an ascending page (first element) — the next `id_lt` cursor. */
export function nextCursor(messages: MsgLike[]): string | undefined {
  return messages.length ? messages[0]?.id : undefined;
}

/** A full page (length === limit) implies more history may exist. */
export function pageHasMore(messages: MsgLike[], limit: number): boolean {
  return messages.length === limit;
}
