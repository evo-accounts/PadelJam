# Roadmap

Goal: launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in **January 2027**. Every launched area works in pt-PT, pt-BR and en, and the privacy policy and terms have been reviewed. Jammer+, community plans and the club dashboard come after launch.

_Owner: CEO. Last updated 2026-11-04. The dates follow the rollout in `docs/superpowers/specs/2026-10-29-agent-team-design.md`, counted from the pilot's start on 2026-10-30._

## Rule for trade-offs

Cut scope before slipping the date. Anything that won't be launch-ready gets hidden, not finished late. If store review or human legal review isn't done in time, launch as a TestFlight / Play closed-testing beta instead of slipping the public date without saying so.

## Phases

| Phase | Dates | Outcome | Owner |
|---|---|---|---|
| Pilot | 2026-10-30 → 11-04 | Done: 0146 and 0147 merged by the CTO, hosted SQL applied by the founder. Retro written (`docs/company/2026-11-04-pilot-retro.md`). Go/no-go is with the founder ([PAD-33](/PAD/issues/PAD-33)). | CEO, CTO |
| Team on | ~11-06 → 11-12 | Recommended in two steps (board decision): PM, Release & Ops and Head of Business about 11-06; Designer, Legal and Growth about 11-12. Launch plan with a January date (Head of Business). Launch-ready checklist per area (PM). Store-readiness gap list, Android especially (Release & Ops). | CEO |
| Build and prepare | ~11-13 → 12-24 | Launch blockers fixed. iOS hardware pass from 11-04 ([PAD-32](/PAD/issues/PAD-32), founder); iOS and Android pass on the release candidate before freeze. Android store build. Listings in three locales. Privacy label. Legal drafts out for human review. | CTO, Head of Business |
| Freeze and submit | ~12-28 → 2027-01-08 | Fixes only. Help articles. The founder submits to both stores, leaving time for review. | CTO, founder |
| Launch | January 2027 | Public in PT and BR, or the beta fallback above. | founder |

## Initiatives now

1. **Close out the pilot** ([PAD-28](/PAD/issues/PAD-28)). Waiting on the founder's Team-on decision ([PAD-33](/PAD/issues/PAD-33)). Engineering checks still open are listed in the retro.
2. **Make the mobile pipeline reliable** (CTO). The runner must stop being the bottleneck: 2 green `e2e` runs of the last 14. Get the migrations workflow onto `main`, then merge #294, #295 and #298.
3. **Onboarding redesign** ([PAD-17](/PAD/issues/PAD-17), CTO). PR 1 is next. The Level privacy-policy line and store labels come to the founder before any build that collects it ships.
4. **Known launch risks from the last audit** (`docs/audit/2026-09-20-state-and-next-steps.md`):
   - No device pass on record since #129. Started as [PAD-32](/PAD/issues/PAD-32), with findings triaged in [PAD-31](/PAD/issues/PAD-31).
   - `seed:demo` doesn't complete, and nothing in CI runs it.
   - The arm64 toolchain migration: insurance, not urgent.
5. **Open items in the `docs/audit/2026-09-*-plan.md` UX plans.** The PM triages them into launch-ready or hidden in the team-on phase.

## Out of scope before launch

Billing (Jammer+, community plans, RevenueCat, Stripe) and the club-owner dashboard.
