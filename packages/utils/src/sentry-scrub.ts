/** Drops the whole query string (and fragment) from a URL, so PostgREST filters like `id=eq.<uuid>`,
 *  `user_id=eq.` or `email=eq.` and Stream's own query never reach Sentry. Works on relative URLs too. */
export function stripQuery(url: string): string;
export function stripQuery(url: undefined | null): undefined;
export function stripQuery(url: string | undefined | null): string | undefined;
export function stripQuery(url: string | undefined | null): string | undefined {
  if (typeof url !== 'string') return undefined;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

type Bag = Record<string, unknown>;

/** Sentry `beforeBreadcrumb`: strips the query from fetch/xhr breadcrumbs. */
export function scrubBreadcrumb<T extends { category?: string; data?: Bag }>(b: T): T {
  if ((b.category === 'fetch' || b.category === 'xhr') && b.data && typeof b.data.url === 'string') {
    return { ...b, data: { ...b.data, url: stripQuery(b.data.url) } };
  }
  return b;
}

type Span = { description?: string; data?: Bag };

/** Sentry `beforeSendTransaction`: strips the query from every span's description and URL attributes. */
export function scrubTransaction<T extends { spans?: Span[] }>(event: T): T {
  if (!event.spans) return event;
  const spans = event.spans.map((span) => {
    const data = span.data ? { ...span.data } : undefined;
    if (data) {
      for (const k of ['url', 'http.url']) if (typeof data[k] === 'string') data[k] = stripQuery(data[k] as string);
      delete data['http.query'];
    }
    // A description is "GET https://host/path?query"; strip the query from the whole string.
    const description = span.description === undefined ? undefined : stripQuery(span.description);
    return { ...span, ...(description !== undefined && { description }), ...(data && { data }) };
  });
  return { ...event, spans };
}
