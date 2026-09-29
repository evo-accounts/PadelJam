// What send-blast decides about a blast before it touches Resend, extracted so it is unit-testable.
// Pure TS with no Deno/npm imports so `pnpm test:functions` can run it under plain `node --test`.
//
// Since 0124 a blast's channels are email and/or whatsapp. WhatsApp is sent from the organizer's
// device (share intent): the RPC records it as a delivery_log row with channel 'whatsapp' and
// status 'shared'. This function only ever delivers — and logs — the email channel.

/** Does this blast have anything for send-blast to deliver? */
export function hasEmailChannel(channels: readonly string[] | null | undefined): boolean {
  return Array.isArray(channels) && channels.includes('email');
}

/** The next email attempt number, from this blast's delivery_log rows (any channel, any order). */
export function nextEmailAttempt(
  rows: readonly { channel: string; attempt: number }[] | null | undefined,
): number {
  let max = 0;
  for (const r of rows ?? []) if (r.channel === 'email' && r.attempt > max) max = r.attempt;
  return max + 1;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The email body. Organizer-authored text is escaped so a stray `<`/`&` renders as typed. */
export function renderBlastEmailHtml(title: string, description: string): string {
  return `<h2>${esc(title)}</h2><p>${esc(description).replace(/\n/g, '<br>')}</p>`;
}
