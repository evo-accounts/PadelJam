import { beforeAll, describe, it } from 'vitest';
import { tap } from '../driver/actions';
import { CONFIG } from '../driver/config';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs } from '../driver/flows';
import { resetDb } from '../fixtures/seed';

/**
 * The E2E build has no EXPO_PUBLIC_STREAM_API_KEY, so chat is off for the whole process
 * (lib/streamClient.ts). These tests pin what the Chat screen does then: it degrades to its empty
 * state rather than throwing "useChatContext was called outside the ChatContext Provider" from
 * ChannelList, which is what it did before issue 81. Nothing else in the suite opens this screen.
 *
 * Skipped under E2E_STREAM=1: that build carries a Stream key, so chat is on and the list is real.
 */
describe.skipIf(CONFIG.flags.stream)('15 chat', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('the Chat button on Home opens the chat list, which shows its empty state', async () => {
    await tap({ label: 'Chat', type: 'Button' });
    await expectVisible({ text: 'No conversations yet.' }, { timeout: 15_000 });
    await expectVisible({ label: 'Start a conversation', type: 'Button' });
  });

  it('the Archived tab shows the same empty state', async () => {
    await tap({ text: /^archived$/i });
    await expectVisible({ text: 'No conversations yet.' }, { timeout: 10_000 });
  });
});
