# Roadmap

Goal: launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in **January 2027**. Every launched area works in pt-PT, pt-BR and en, and the privacy policy and terms have been reviewed. Jammer+, community plans and the club dashboard come after launch.

_Owner: CEO. Last updated 2026-11-06, 08:10 UTC. The dates follow `docs/business/launch-plan.md`, which holds the row-by-row plan._

## Rule for trade-offs

Cut scope before slipping the date. Anything that won't be launch-ready gets hidden, not finished late. If store review or human legal review isn't done in time, launch as a TestFlight / Play closed-testing beta instead of slipping the public date without saying so.

## Phases

| Phase | Dates | Outcome | Owner |
|---|---|---|---|
| Pilot | 2026-10-30 → 11-04 | Done: 0146 and 0147 merged by the CTO, hosted SQL applied by the founder. Retro written (`docs/company/2026-11-04-pilot-retro.md`). Founder's decision: staged go ([PAD-33](/PAD/issues/PAD-33)). | CEO, CTO |
| Team on | 11-05 → ~11-12 | First group (Head of Business, PM, Release & Ops) started 11-05 14:45 UTC; their plan, checklist and gap list are on `main`. Second group (Designer, Growth) about 11-12, only if the check on 11-11 passes ([PAD-52](/PAD/issues/PAD-52)). Legal is now a separate company, not a hire. | CEO |
| Build and prepare | now → 12-24 | Launch blockers fixed. iOS build 19 and device pass from 11-20 ([PAD-311](/PAD/issues/PAD-311), [PAD-32](/PAD/issues/PAD-32)); first Android build by 11-20 ([PAD-253](/PAD/issues/PAD-253)); release candidate 12-22. Listings in three locales. Privacy label. Interim policy live 12-03; legal drafts to human review 11-25, reviewed text 12-21. | CTO, Head of Business |
| Freeze and submit | ~12-28 → 2027-01-08 | Fixes only. Help articles. The founder submits to both stores, leaving time for review. | CTO, founder |
| Launch | January 2027 | Public in PT and BR, or the beta fallback above. | founder |

## Initiatives now

1. **Make the mobile pipeline reliable** (CTO). This is what's holding finished work off `main`. `e2e` has 7 green of 31 finished runs since 11-04 10:22, and 1 of the last 18. The fix is on [PAD-228](/PAD/issues/PAD-228) and [PAD-230](/PAD/issues/PAD-230) (#335, not yet green). [PAD-51](/PAD/issues/PAD-51) reports the classified numbers on 11-11. Vercel's refusals are on and off, cause unconfirmed; the merge rule is with the founder ([PAD-268](/PAD/issues/PAD-268)). The migrations workflow's manual run passed ([PAD-97](/PAD/issues/PAD-97)); applying on merge hasn't had a real run. The runner keeping Docker up is merged (#311), with one drill left ([PAD-172](/PAD/issues/PAD-172)).
2. **Close the security audit's findings** (CTO). Fix PRs are open and none has merged. The privacy fix comes first: PR 1 is #320, and PR 2's target is 11-23, latest 12-02 ([PAD-154](/PAD/issues/PAD-154)). **No outside tester is invited until it's live.**
3. **Set the free launch's shape** (CTO). Founder's decision on [PAD-142](/PAD/issues/PAD-142): option A, with free limits of 250 members, unlimited groups and series, 3 co-organizers, and plan surfaces hidden. #328 hides them and is ready apart from Vercel's red; #332 raises the limits; #327 closes the self-grant, after #328 is live. Phone sign-in is hidden with no Twilio spend ([PAD-137](/PAD/issues/PAD-137), #340, merge by 11-18). Blasts: one real test send by 11-12, or hide Send blast ([PAD-184](/PAD/issues/PAD-184), [PAD-180](/PAD/issues/PAD-180)). Still open for later: grandfathering at billing.
4. **Get onboarding onto a device.** All four PRs are merged, and none of it has run on a device. The Level line is live ([PAD-126](/PAD/issues/PAD-126)). iOS build 19 is held until #328, #340 and the iPad answer are in, then one device pass ([PAD-312](/PAD/issues/PAD-312), [PAD-311](/PAD/issues/PAD-311), [PAD-32](/PAD/issues/PAD-32)). Plan date 11-20; the CEO checks on 11-16. The build steps are unmerged on #317.
5. **Legal and hosted decisions** (CEO, founder). Legal's drafts are in, none publishable ([PAD-239](/PAD/issues/PAD-239)). The founder's plan decisions are on [PAD-240](/PAD/issues/PAD-240), first three by 11-13. Hosted database plan: decision 11-27, in place by 12-03, before testers (plan row 46, a gate 4 decision).
6. **Known launch risks:**
   - **The live privacy policy** is English-only, hasn't had a legal review, and omits gender, date of birth, map location, Sentry, Twilio and Nominatim. The data inventory now exists (plan row 9a). The interim corrected policy is due live 12-03, and the reviewed text 12-21.
   - **Brazil's ECA Digital** may apply, and we have no Brazilian counsel yet. Press reports say enforcement starts January 2027. Launching in Portugal first is a gate 8 option, brought to the founder only if there's no answer by 12-11.
   - **No device pass on record since #129,** and no Android build has been confirmed.
   - **The 11-11 second-group check** may hold the Designer and Growth hires.
   - **Invitations left over from before 0147:** one read left ([PAD-99](/PAD/issues/PAD-99), [PAD-215](/PAD/issues/PAD-215)).
   - **`seed:demo`** doesn't complete, and nothing in CI runs it.
   - **The arm64 toolchain migration:** insurance, not urgent.

## Out of scope before launch

Billing (Jammer+, community plans, RevenueCat, Stripe) and the club-owner dashboard.
