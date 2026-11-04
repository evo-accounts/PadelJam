# Team-on plan, 2026-11-04

The founder chose **staged, with two additions** on [PAD-33](/PAD/issues/PAD-33). This plan carries that out. It replaces Task 6, Step 5 of the pilot plan. Hire requests still go to the founder for approval.

## Order

1. **Hand-off fix goes live** ([PAD-50](/PAD/issues/PAD-50), CTO, by end of 11-05). The founder made this a condition of the first group starting.
2. **Memory recording starts now** ([PAD-51](/PAD/issues/PAD-51), CTO), so there's a "before" to compare with.
3. **Hire requests** for the first group, once 1 is live and this plan has merged ([PAD-49](/PAD/issues/PAD-49), CEO). They need the updated `_rules.md`, so they can't go earlier.
4. **The founder approves;** the first group starts about 11-06. If the fix is late, the start moves with it.
5. **Second-group check** on 11-11 ([PAD-52](/PAD/issues/PAD-52), CEO), then Designer, Legal and Growth about 11-12 if it passes.

## First group

| Role | Reports to | Model | Timer | First task, due 11-12 |
|---|---|---|---|---|
| Head of Business | CEO | Sonnet 5.5 | Off | The launch plan with a January date, in `docs/business/` |
| Product Manager | CTO | Sonnet 5.5 | Off | A launch-ready checklist per area, with anything that won't be ready cut or hidden, and a triage of the UX plans' open items |
| Release & Ops | CTO | Sonnet 5.5 | Off | The store-readiness gap list, Android especially, in `docs/handoff/` |

Instructions are in `docs/agents/`: `head-of-business.md`, `product-manager.md` and `release-ops.md`, each with `_rules.md` appended.

**Why these settings differ from the charter:** the charter gives the PM a daily timer and Head of Business a weekly one. The Mac hosts 23 agents across four companies on 16 GB, so three more isn't only a subscription question. All three wake only on assignment, one run at a time, with no MCP servers beyond what the other agents have. I'd add a timer only if work is being missed without one.

**Budgets:** $10 warning caps, like the pilot agents. The spend data is still too thin to set real ones.

## Decisions that stand

- No Engineer C.
- No Xcode on the agents' account.
- CEO and CTO stay on 4-hour heartbeats until #295 merges (#294 already has), then go daily.

## The check for the second group

"No usage-limit stops" isn't enough on its own. With the first three running, nothing on the Mac may have got worse.

**Windows**
- **Before the fix:** 11-03 20:56 to 11-04 10:22. For the record only: it should look bad, and the fix should improve it.
- **Comparison:** from the fix going live to the first hire starting. This is what the first group is judged against, so they aren't credited or blamed for the fix. It may be under two days, so it's thin.
- **Group on:** from the first hire starting to 11-11.

**Starting numbers (before the fix)**

| Measure | Number | Source |
|---|---|---|
| e2e attempts finished, and green | 9, 3 green | GitHub, counting attempts |
| Suites failing with the environment signature | 8 of 96, over the first 6 attempts | [PAD-45](/PAD/issues/PAD-45) |
| Rescues | About 8 in about 14 hours | The founder's count |
| Memory | No history | [PAD-51](/PAD/issues/PAD-51) starts it |
| Usage-limit stops | None | Run logs |

Real test failures, such as the selector bug, don't count against the Mac and are reported on their own row.

**What counts as worse:** any of these, in the group-on window against the comparison window:
- Environment-signature failures are a higher share of suites.
- Rescues per 24 hours are higher.
- Swap or time under memory pressure is clearly higher.
- Any usage-limit stop.

**A rescue** is a board comment or action that wakes, re-routes or closes a task because its owner wasn't moving. Decisions and answers don't count. It would make the count far more reliable if the board started those comments with `Rescue:`.

**If it's worse:** I hold the second group and tell the founder, with the numbers. **If it isn't:** I report the numbers and send the three hire requests for approval. Either way the numbers go on the board. The counts will be small, so I'll say where they can't carry a conclusion, and a borderline result counts as worse: holding costs a few days, and a crowded Mac costs every company on it.

## Open risks

- **Group-on overlaps the onboarding merges.** Those use the runner heavily, so the windows won't be alike. [PAD-46](/PAD/issues/PAD-46)'s quiet-Mac runs are a difference to note too.
- **Other companies share the Mac.** A bad week may not be PadelJam's doing, but the Mac is still full, so I'd still hold.
- **Three agents with no runner work can still add memory load.** That's what the check is for.
