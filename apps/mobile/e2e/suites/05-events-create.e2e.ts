import { beforeAll, describe, it } from 'vitest';
import { query, queryAll, snapshot } from '../driver/a11y';
import { scrollUntilVisible, tap, typeText } from '../driver/actions';
import { expectVisible } from '../driver/expect';
import { freshInstall } from '../driver/app';
import { loginAs, tabTo } from '../driver/flows';
import { select } from '../fixtures/db';
import { pollUntil } from '../fixtures/poll';
import { manifest, resetDb } from '../fixtures/seed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The create-event wizard is 10 steps (Where? → Format → Players → Scoring →
 * Location → Courts → When? → Preferences → Details → Invite players). Several
 * steps gate "Next" behind a choice, so we advance by reading the "Step N of 10"
 * indicator and selecting an option whenever Next does not move us forward.
 */
describe('05 event create wizard', () => {
  beforeAll(async () => {
    await resetDb('full');
    await freshInstall();
    await loginAs('alex'); // community admin → can create group events
    await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 20_000 });
  });

  const stepNumber = async (): Promise<number> => {
    const el = query(await snapshot(), { text: /step \d+ of \d+/i });
    const m = /step (\d+) of/i.exec(el?.AXLabel ?? '');
    return m ? Number(m[1]) : -1;
  };

  const openWizard = async () => {
    await tabTo('Home');
    await tap({ text: /create event/i });
    await expectVisible({ text: /step 1 of/i }, { timeout: 20_000 });
  };

  /** Advance one step; if Next is gated, choose the first offered option first. */
  const advance = async (): Promise<number> => {
    const before = await stepNumber();
    await tap({ text: /^next$/i });
    await sleep(900);
    if ((await stepNumber()) !== before) return stepNumber();
    // Gated: pick the first selectable option that is not a nav control.
    const options = queryAll(await snapshot(), { type: 'Button' }).filter(
      (b) => !/^(next|back|close)$/i.test(b.AXLabel ?? '') && (b.AXLabel ?? '').length > 0,
    );
    if (options[0]) {
      await tap({ label: options[0].AXLabel! });
      await sleep(500);
      await tap({ text: /^next$/i });
      await sleep(900);
    }
    return stepNumber();
  };

  /** Walk forward until the given step number is showing. */
  const advanceTo = async (target: number) => {
    for (let i = 0; i < 20; i++) {
      const step = await stepNumber();
      if (step >= target) return;
      await advance();
    }
    throw new Error(`wizard never reached step ${target} (stuck at ${await stepNumber()})`);
  };

  it('walks the wizard to the Details step', async () => {
    await openWizard();
    await advanceTo(9);
    await expectVisible({ text: /details/i });
  });

  it('blocks Next on Details until an event name is entered', async () => {
    await tap({ text: /^next$/i });
    await sleep(1200);
    const step = await stepNumber();
    if (step !== 9) throw new Error(`Details advanced to step ${step} with an empty name`);
  });

  it('creates the event end to end', async () => {
    const m = manifest();
    const name = `E2E Wizard ${Date.now() % 100000}`;
    await typeText({ text: /saturday americano/i, type: 'TextField' }, name);
    await tap({ text: /^next$/i });
    await sleep(1200);
    await scrollUntilVisible({ text: /^create event$/i, type: 'Button' }, { maxSwipes: 5 });
    await tap({ text: /^create event$/i, type: 'Button' });
    const rows = await pollUntil(
      () => select('events', `name=eq.${encodeURIComponent(name)}&select=id,organizer_id`),
      (r) => (r as unknown[]).length === 1,
      { label: 'event row created', timeoutMs: 30_000 },
    );
    const created = (rows as { organizer_id: string }[])[0]!;
    if (created.organizer_id !== m.users.alex) throw new Error('organizer_id is not the creating user');
    // And it surfaces in the organizer's own list.
    await tabTo('Events');
    await tap({ text: /organizing/i });
    await expectVisible({ text: /e2e wizard/i }, { timeout: 20_000 });
  });
});
