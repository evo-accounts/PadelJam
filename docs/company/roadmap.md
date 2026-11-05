# Roadmap

Goal: launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in **January 2027**. Every launched area works in pt-PT, pt-BR and en, and the privacy policy and terms have been reviewed. Jammer+, community plans and the club dashboard come after launch.

_Owner: CEO. Last updated 2026-11-05, 10:30 UTC. The dates follow the rollout in `docs/superpowers/specs/2026-10-29-agent-team-design.md`, counted from the pilot's start on 2026-10-30._

## Rule for trade-offs

Cut scope before slipping the date. Anything that won't be launch-ready gets hidden, not finished late. If store review or human legal review isn't done in time, launch as a TestFlight / Play closed-testing beta instead of slipping the public date without saying so.

## Phases

| Phase | Dates | Outcome | Owner |
|---|---|---|---|
| Pilot | 2026-10-30 → 11-04 | Done: 0146 and 0147 merged by the CTO, hosted SQL applied by the founder. Retro written (`docs/company/2026-11-04-pilot-retro.md`). Founder's decision: staged go ([PAD-33](/PAD/issues/PAD-33)). | CEO, CTO |
| Team on | ~11-06 → 11-12 | In two steps (`docs/company/2026-11-04-team-on-plan.md`): PM, Release & Ops and Head of Business about 11-06, once the founder releases the hold ([PAD-56](/PAD/issues/PAD-56)); Designer, Legal and Growth about 11-12, if nothing got worse on the Mac. Launch plan with a January date (Head of Business). Launch-ready checklist per area (PM). Store-readiness gap list, Android especially (Release & Ops). | CEO |
| Build and prepare | ~11-13 → 12-24 | Launch blockers fixed. iOS hardware pass from 11-04 ([PAD-32](/PAD/issues/PAD-32), founder); iOS and Android pass on the release candidate before freeze. Android store build. Listings in three locales. Privacy label. Legal drafts out for human review. | CTO, Head of Business |
| Freeze and submit | ~12-28 → 2027-01-08 | Fixes only. Help articles. The founder submits to both stores, leaving time for review. | CTO, founder |
| Launch | January 2027 | Public in PT and BR, or the beta fallback above. | founder |

## Initiatives now

1. **Start the first Team-on group** ([PAD-49](/PAD/issues/PAD-49)). The hand-off fix is live ([PAD-50](/PAD/issues/PAD-50)) and the hire requests are sent. The founder is holding [PAD-56](/PAD/issues/PAD-56) until the migrations workflow's manual run passes ([PAD-97](/PAD/issues/PAD-97)).
2. **Make the mobile pipeline reliable** (CTO). The runner must stop being the bottleneck, and must keep Docker up by itself ([PAD-98](/PAD/issues/PAD-98)): 6 green of 13 finished `e2e` attempts since 11-04 10:22, after 3 of 9 before it. [PAD-51](/PAD/issues/PAD-51) reports the classified numbers on 11-11. The migrations workflow is on `main`, with its secrets moved out of pull request runs (#309), but that version hasn't had a test run, and applying on merge hasn't passed yet ([PAD-97](/PAD/issues/PAD-97)).
3. **Onboarding redesign.** All four PRs are merged ([PAD-17](/PAD/issues/PAD-17) done), but none of it has run on a device, and no build has it. The Level privacy-policy line and store labels are with the founder ([PAD-65](/PAD/issues/PAD-65)), and must be settled before any build that collects Level ships ([PAD-64](/PAD/issues/PAD-64)).
4. **Known launch risks from the last audit** (`docs/audit/2026-09-20-state-and-next-steps.md`):
   - No device pass on record since #129. Asked for in [PAD-32](/PAD/issues/PAD-32) and not started yet, with findings to be triaged in [PAD-31](/PAD/issues/PAD-31). I now recommend running it on a new iOS build with the redesign, once [PAD-65](/PAD/issues/PAD-65) is settled.
   - Invitations left over from before 0147 ([PAD-99](/PAD/issues/PAD-99), CTO).
   - `seed:demo` doesn't complete, and nothing in CI runs it.
   - The arm64 toolchain migration: insurance, not urgent.
5. **Open items in the `docs/audit/2026-09-*-plan.md` UX plans.** The PM triages them into launch-ready or hidden in the team-on phase.

## Out of scope before launch

Billing (Jammer+, community plans, RevenueCat, Stripe) and the club-owner dashboard.
