import { join } from 'node:path';

import { beforeAll, describe, it } from 'vitest';

import { MOBILE_NAMESPACES } from '../../lib/i18n-mobile';
import { tap, typeText } from '../driver/actions';
import { freshInstall, relaunch } from '../driver/app';
import { CONFIG } from '../driver/config';
import { expectVisible } from '../driver/expect';
import { deepLink, loginAs, tapAlertButton } from '../driver/flows';
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
      const shot = async (frame: string) => {
        // Let the push animation finish, or the frame catches rounded corners and the previous screen.
        await new Promise((r) => setTimeout(r, 800));
        await screenshot(join(CONFIG.artifactsDir, 'onboarding-screens', `${locale}-${frame}.png`));
      };

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
        await expectVisible(title(t.locationShareTitle), { timeout: 30_000 });
        await shot('location');

        await tap({ text: new RegExp(escape(t.locationAddManually), 'i') });
        await expectVisible(title(t.locationTitle));
        await typeText({ type: 'TextField' }, 'Lisboa');
        // Continue stays disabled until the debounced geocode resolves.
        await expectVisible({ id: 'location-result-0' }, { timeout: 10_000 });
        await shot('location-manual');
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.levelTitle), { timeout: 30_000 });
        await shot('level');
        await tap({ text: new RegExp(escape(t.levelIntermediate), 'i') });
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.handTitle), { timeout: 30_000 });
        await shot('hand');
        await tap({ label: t.handRight });
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.sideTitle));
        await shot('side');
        await tap({ label: t.sideLeft });
        await tap({ label: t.continue, type: 'Button' });

        await expectVisible(title(t.notificationsTitle));
        await shot('notifications');

        await tap({ text: new RegExp(escape(t.notificationsEnable), 'i'), type: 'Button' });
        await tapAlertButton(/allow|permitir/i);
        await expectVisible({ text: /Jammer\+/ }, { timeout: 30_000 });
        await shot('plans');

        // Leaving by the ✕ marks onboarding done; then the settings-mode paywall must look as before.
        await tap({ label: t.jammerPlusFree });
        await expectVisible({ text: 'Home', type: 'Heading' }, { timeout: 30_000 });
        await deepLink('mobile:///profile/plan', /Jammer\+/);
        await shot('paywall-settings');
      });
    });
  }
});
