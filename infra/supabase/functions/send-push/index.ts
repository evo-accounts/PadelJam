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
    .select('user_id, type, actor_name, entity_name, event_id, group_id, community_id, ref_id')
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
  const data = { type: n.type, event_id: n.event_id, group_id: n.group_id, community_id: n.community_id, ref_id: n.ref_id };
  const messages = list.map((t) => ({ to: t.expo_token, title, body: msg, data, sound: 'default' }));

  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    if (!res.ok) {
      try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
        attempt: 1, status: 'failed', failed_count: messages.length, error: `expo_failed:${res.status}` }); } catch { /* best-effort */ }
      return json({ ok: false, error: `expo_failed:${res.status}` }, 200); // soft-fail
    }
  }
  try { await admin.from('delivery_log').insert({ channel: 'push', notification_id: body.notification_id,
    attempt: 1, status: 'sent', sent_count: messages.length }); } catch { /* best-effort */ }
  return json({ ok: true, sent: messages.length });
});
