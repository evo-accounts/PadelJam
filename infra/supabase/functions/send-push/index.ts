import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Server-side copy for each notification type (mirrors the in-app notification lines).
function render(n: { type: string; actor_name: string | null; entity_name: string | null }): { title: string; body: string } {
  const actor = n.actor_name ?? 'Someone';
  const entity = n.entity_name ?? '';
  switch (n.type) {
    case 'follow': return { title: 'Padel Jam', body: `${actor} followed you` };
    case 'event_invite': return { title: 'Event invite', body: `${actor} invited you to ${entity}` };
    case 'group_invite': return { title: 'Group invite', body: `${actor} invited you to ${entity}` };
    case 'community_invite': return { title: 'Community invite', body: `${actor} invited you to ${entity}` };
    case 'community_request_accepted': return { title: 'Request accepted', body: `Your request to join ${entity} was accepted` };
    case 'follow_joined_event': return { title: 'Padel Jam', body: `${actor} joined ${entity}` };
    case 'event_cancelled': return { title: 'Event cancelled', body: `${entity} was cancelled` };
    case 'event_updated': return { title: 'Event updated', body: `${entity} was updated — check the new details` };
    case 'participant_confirmed': return { title: 'Player confirmed', body: `${actor} confirmed for ${entity}` };
    case 'waitlist_spot': return { title: 'A spot opened', body: `A spot opened in ${entity} — confirm it before it goes` };
    case 'results_published': return { title: 'Results are out', body: `Results for ${entity} are out` };
    case 'event_created': return { title: 'New event', body: `${actor} created ${entity}` };
    case 'partner_left': return { title: 'Your partner left', body: `Your partner left ${entity} — set your team again` };
    case 'partner_request': return { title: 'Partner request', body: `${actor} wants to partner with you in ${entity}` };
    case 'organizer_confirmed': return { title: 'You are in', body: `${actor} confirmed you for ${entity}` };
    case 'removed_from_event': return { title: 'Removed from event', body: `${actor} removed you from ${entity}` };
    default: return { title: 'Padel Jam', body: 'You have a new notification' };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'push_not_configured' }, 500);
  if (req.headers.get('x-push-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  let body: { notification_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.notification_id) return json({ error: 'notification_id required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const { data: n, error: nErr } = await admin
    .from('notifications')
    .select('user_id, type, actor_name, entity_name, event_id, group_id, community_id, ref_id, actor_id')
    .eq('id', body.notification_id)
    .maybeSingle();
  if (nErr || !n) return json({ error: 'notification_not_found' }, 404);

  const { data: settings } = await admin
    .from('user_settings').select('notifications_push').eq('user_id', n.user_id).maybeSingle();
  // No row = column default (push ON), matching the app's settings DEFAULTS. Only an explicit
  // false opts out (user_settings is created lazily, so most users have no row).
  if (settings && settings.notifications_push === false) return json({ ok: true, skipped: 'push_off' });

  const { data: tokens } = await admin
    .from('push_tokens').select('expo_token').eq('user_id', n.user_id);
  const list = (tokens ?? []) as { expo_token: string }[];
  if (list.length === 0) return json({ ok: true, skipped: 'no_tokens' });

  const { title, body: msg } = render(n);
  const data = { type: n.type, event_id: n.event_id, group_id: n.group_id, community_id: n.community_id, ref_id: n.ref_id, actor_id: n.actor_id };
  const messages = list.map((t) => ({ to: t.expo_token, title, body: msg, data, sound: 'default' }));

  let sent = 0;
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
        attempt: 1, status: 'failed', failed_count: messages.length, error: `expo_failed:${res.status}` }); } catch { /* best-effort */ }
      return json({ ok: false, error: `expo_failed:${res.status}` }, 200); // soft-fail
    }
    // Per-ticket outcomes: count real sends, collect DeviceNotRegistered tokens for pruning.
    try {
      const tickets = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (tickets.data ?? []).forEach((t, idx) => {
        if (t.status === 'ok') sent += 1;
        else if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(chunk[idx].to);
      });
    } catch {
      sent += chunk.length; // unparseable body — assume delivered (previous behavior)
    }
  }
  if (deadTokens.length) {
    try { await admin.from('push_tokens').delete().in('expo_token', deadTokens); } catch { /* best-effort */ }
  }
  try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
    attempt: 1, status: 'sent', sent_count: sent, failed_count: messages.length - sent }); } catch { /* best-effort */ }
  return json({ ok: true, sent });
});
