import { join } from 'node:path';

import { beforeAll, describe, it } from 'vitest';

import { MOBILE_NAMESPACES } from '../../lib/i18n-mobile';
import { tap, typeText } from '../driver/actions';
import { freshInstall, relaunch } from '../driver/app';
import { CONFIG } from '../driver/config';
import { expectVisible } from '../driver/expect';
import { loginAs } from '../driver/flows';
import { overrideStatusBar, screenshot } from '../driver/sim';
import { rest } from '../fixtures/db';
import { PERSONAS } from '../fixtures/personas';
import { resetDb } from '../fixtures/seed';

/**
 * Saves the onboarding frames in en and pt-BR to
 * `<artifacts>/onboarding-screens/<locale>-<frame>.png` so a person can look at
 * them (PAD-18). It asserts each frame's title, never its layout. Suite
 * 02-onboarding covers behaviour; this one only walks the flow.
 *
 * To change the flow (PR 2 and PR 3), edit the frame list in `walk`.
 */
const LOCALES = ['en', 'pt-BR'] as const;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('02 onboarding screens', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const t = MOBILE_NAMESPACES.onboarding[locale === 'en' ? 'en' : 'pt-BR'];
      const title = (s: string) => ({ text: new RegExp(escape(s), 'i') });
      const shot = (frame: string) =>
        screenshot(join(CONFIG.artifactsDir, 'onboarding-screens', `${locale}-${frame}.png`));

      beforeAll(async () => {
        await resetDb('full'); // omar is seeded not-onboarded
        await freshInstall();
        await overrideStatusBar();
        // _layout.tsx reads profiles.locale once at startup, so set it, log in, then relaunch.
        await rest(`/rest/v1/profiles?email=eq.${PERSONAS.omar.email}`, {
          method: 'PATCH',
          body: { locale },
        });
        await loginAs('omar');
        await relaunch();
      });

      it('saves the frames', async () => {
        await expectVisible(title(t.locationTitle), { timeout: 30_000 });
        await shot('location');

        await tap({ text: new RegExp(escape(t.locationAddManually), 'i') });
        await expectVisible(title(t.locationManualTitle));
        await typeText({ type: 'TextField' }, 'Lisboa');
        // Continue stays disabled until the debounced geocode resolves.
        await expectVisible({ text: /lisboa/i, type: 'StaticText' }, { timeout: 10_000 });
        await shot('location-manual');
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.handTitle), { timeout: 30_000 });
        await shot('hand');
        await tap({ label: t.handRight, type: 'Button' });
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.sideTitle));
        await shot('side');
        await tap({ label: t.sideLeft, type: 'Button' });
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.notificationsTitle));
        await shot('notifications');
      });
    });
  }
});
