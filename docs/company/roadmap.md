# Roadmap

Goal: launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in **January 2027**. Every launched area works in pt-PT, pt-BR and en, and the privacy policy and terms have been reviewed. Jammer+, community plans and the club dashboard come after launch.

_Owner: CEO. Last updated 2026-11-02. The dates follow the rollout in `docs/superpowers/specs/2026-10-29-agent-team-design.md`, counted from the pilot's start on 2026-10-30._

## Rule for trade-offs

Cut scope before slipping the date. Anything that won't be launch-ready gets hidden, not finished late. If store review or human legal review isn't done in time, launch as a TestFlight / Play closed-testing beta instead of slipping the public date without saying so.

## Phases

| Phase | Dates | Outcome | Owner |
|---|---|---|---|
| Pilot | 2026-10-30 → ~11-05 | One task end to end (0146), plus a follow-up (0147). Merged by the CTO, hosted SQL applied by the founder. Retro and go/no-go. | CEO, CTO |
| Team on | ~11-06 → 11-12 | PM, Designer, Release & Ops, Head of Business, Growth and Legal start (board decision). Launch plan with a January date (Head of Business). Launch-ready checklist per area (PM). Store-readiness gap list, Android especially (Release & Ops). | CEO |
| Build and prepare | ~11-13 → 12-24 | Launch blockers fixed. Hardware pass on iOS and Android (founder). Android store build. Listings in three locales. Privacy label. Legal drafts out for human review. | CTO, Head of Business |
| Freeze and submit | ~12-28 → 2027-01-08 | Fixes only. Help articles. The founder submits to both stores, leaving time for review. | CTO, founder |
| Launch | January 2027 | Public in PT and BR, or the beta fallback above. | founder |

## Initiatives now

1. **Finish the pilot** ([PAD-2](/PAD/issues/PAD-2), [PAD-6](/PAD/issues/PAD-6), [PAD-9](/PAD/issues/PAD-9), [PAD-10](/PAD/issues/PAD-10)). The work is complete: PR #292 (0146 + 0147) merged on 2026-11-01, and the hosted SQL was applied and verified on 2026-11-02. Left to do: close the two tasks, then the retro and the go/no-go by ~11-05.
2. **Known launch risks from the last audit** (`docs/audit/2026-09-20-state-and-next-steps.md`). The CTO turns these into tasks once the pilot closes:
   - No device pass since #129. The founder starts it, and it's needed before freeze.
   - `seed:demo` doesn't complete, and nothing in CI runs it.
   - The arm64 toolchain migration: insurance, not urgent.
3. **Open items in the `docs/audit/2026-09-*-plan.md` UX plans.** The PM triages them into launch-ready or hidden in the team-on phase.

## Out of scope before launch

Billing (Jammer+, community plans, RevenueCat, Stripe) and the club-owner dashboard.
