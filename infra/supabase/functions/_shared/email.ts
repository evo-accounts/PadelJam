// Thin Resend REST wrapper. RESEND_API_KEY/RESEND_FROM_EMAIL unset -> throws 'email_not_configured';
// callers decide how to surface it (send-roster-csv returns 200 {ok:false}; send-blast swallows it).
const API = 'https://api.resend.com/emails';

type Attachment = { filename: string; content: string /* base64 */ };
type Mail = { to: string; subject: string; html: string; attachments?: Attachment[] };

function keyOrThrow(): { key: string; from: string } {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!key || !from) throw new Error('email_not_configured');
  return { key, from };
}

export async function sendEmail(mail: Mail): Promise<void> {
  const { key, from } = keyOrThrow();
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, html: mail.html, attachments: mail.attachments }),
  });
  if (!res.ok) throw new Error(`resend_failed:${res.status}`);
}

export async function sendBatchEmails(mails: Omit<Mail, 'attachments'>[]): Promise<void> {
  const { key, from } = keyOrThrow();
  // Resend batch caps at 100 per request; chunk.
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100).map((m) => ({ from, to: m.to, subject: m.subject, html: m.html }));
    const res = await fetch(`${API}/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`resend_failed:${res.status}`);
  }
}
