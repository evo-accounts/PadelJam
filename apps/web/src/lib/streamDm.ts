import { streamClient } from '@/lib/streamClient';

/**
 * Opens (creating on first use) the 1:1 channel between the viewer and `otherId`, and returns its
 * cid. The app layout's `StreamConnection` connects the client, but a page can be used before the
 * token has arrived; `channel.watch()` on a client that never called `connectUser` would fail, so
 * this waits (up to `timeoutMs`) for the connection to start, then `watch()` awaits the socket.
 */
export async function openDirectChannel(uid: string, otherId: string, timeoutMs = 8000): Promise<string> {
  const started = Date.now();
  while (streamClient.userID !== uid) {
    if (Date.now() - started > timeoutMs) throw new Error('chat_not_connected');
    await new Promise((r) => setTimeout(r, 200));
  }
  const ch = streamClient.channel('messaging', { members: [uid, otherId] });
  await ch.watch();
  return ch.cid;
}
