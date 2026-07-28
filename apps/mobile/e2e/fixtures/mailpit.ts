import { CONFIG } from '../driver/config';

interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
  Created: string;
  Snippet?: string;
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${CONFIG.mailpitUrl}${path}`);
  if (!res.ok) throw new Error(`Mailpit ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Fetch the most recent OTP code emailed to `address` after `sinceMs`.
 * Supabase auth emails contain a 6-digit token.
 */
export async function latestOtp(address: string, sinceMs: number, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await api<{ messages: MailpitMessage[] }>(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=5`);
    for (const msg of list.messages ?? []) {
      if (new Date(msg.Created).getTime() < sinceMs - 5_000) continue;
      const detail = await api<{ Text: string; HTML: string }>(`/api/v1/message/${msg.ID}`);
      const body = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`;
      const m = body.match(/\b(\d{6})\b/);
      if (m?.[1]) return m[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No OTP email for ${address} within ${timeoutMs}ms`);
}

export async function mailpitHealthy(): Promise<boolean> {
  try {
    await api('/api/v1/info');
    return true;
  } catch {
    return false;
  }
}
