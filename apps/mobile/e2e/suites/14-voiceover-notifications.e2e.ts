import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { beforeAll, describe, it } from 'vitest';
import { snapshot, type AxElement } from '../driver/a11y';
import { backGesture, tap } from '../driver/actions';
import { expectGone, expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs } from '../driver/flows';
import { rest } from '../fixtures/db';
import { manifest, resetDb } from '../fixtures/seed';

/**
 * VoiceOver reachability on the notifications screen.
 *
 * Written as a 99-* scratch spec alongside the fixes in the closed #92, which
 * meant the base config excluded it and nothing ever ran it. The fixes
 * themselves reached main by another route, so what was missing was not the
 * behaviour but the GUARD: these are exactly the properties that broke silently
 * once and would break silently again, since a composed `ListRow` looks correct
 * on screen while swallowing its own trailing control.
 *
 * It needs no VoiceOver session and no special setup — it reads the same
 * `idb describe-all` tree every other suite reads, which is why it belongs in
 * the numbered run rather than in the scratch series.
 *
 * `dump()` and `shot()` write a tree listing and a screenshot per test to
 * VO_DUMP_DIR (default /tmp). Kept: when one of these fails, "which elements
 * DID exist" is the whole diagnosis.
 */
const OUT = process.env.VO_DUMP_DIR ?? '/tmp';

function shot(name: string) {
  execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', `${OUT}/${name}.png`], {
    env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' },
    stdio: 'ignore',
  });
}

function dump(name: string, els: AxElement[]) {
  const lines = els
    .filter((e) => e.type !== 'Other' || e.AXLabel)
    .map((e) => `${e.type.padEnd(12)} ${JSON.stringify(e.AXLabel ?? e.AXValue ?? '')}  @${Math.round(e.frame.x)},${Math.round(e.frame.y)} ${Math.round(e.frame.width)}x${Math.round(e.frame.height)}`);
  writeFileSync(`${OUT}/${name}.txt`, lines.join('\n') + '\n');
}

describe('14 voiceover: notifications', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex');
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  it('a CTA notification exposes the row and the Join button as separate elements', async () => {
    const m = manifest();
    await rest('/rest/v1/notifications', {
      method: 'POST',
      body: {
        user_id: m.users.alex,
        type: 'community_invite',
        actor_id: m.users.maria,
        community_id: m.communities.C,
        actor_name: 'Maria Santos',
        entity_name: 'Cascais Social',
      },
      prefer: 'return=minimal',
    });
    await tap({ label: 'Notifications', type: 'Button' });
    const row = await expectVisible({ text: /maria santos invited you to cascais social/i, type: 'Button' }, { timeout: 30_000 });
    const join = await expectVisible({ label: 'Join', type: 'Button' });
    if (row.frame.x + row.frame.width > join.frame.x + 1) {
      throw new Error(`row element overlaps the Join button: row ends at ${row.frame.x + row.frame.width}, Join starts at ${join.frame.x}`);
    }
    dump('01-notifications-list', await snapshot());
    shot('01-notifications-list');
    // Tap the card's padding, well outside the 24pt text: the hit slop must open the row.
    await tap({ x: row.frame.x + 40, y: row.frame.y + row.frame.height + 12 });
    await expectVisible({ text: /cascais social/i, type: 'Heading' }, { timeout: 20_000 }).catch(async () => {
      // Community screens may not use a Heading; accept any screen change away from the list.
      await expectGone({ label: 'More', type: 'Button' });
    });
    await backGesture();
    await expectVisible({ label: 'More', type: 'Button' }, { timeout: 20_000 });
  });

  it('the settings menu rows are reachable and Close dismisses it', async () => {
    await tap({ label: 'More', type: 'Button' });
    await expectVisible({ label: 'Mark all as read', type: 'Button' });
    await expectVisible({ label: 'Clear all', type: 'Button' });
    await expectVisible({ label: 'Close', type: 'Button' });
    dump('02-settings-menu-open', await snapshot());
    shot('02-settings-menu-open');
    await tap({ label: 'Close', type: 'Button' });
    await expectGone({ label: 'Mark all as read' });
    dump('03-settings-menu-closed', await snapshot());
  });

  it('Mark all as read is activatable', async () => {
    await tap({ label: 'More', type: 'Button' });
    await tap({ label: 'Mark all as read', type: 'Button' });
    await expectGone({ label: 'Mark all as read' });
    dump('04-after-mark-all-read', await snapshot());
  });
});
