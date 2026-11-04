# Hand-off fix (PAD-50)

The founder made this a condition of the first Team-on group starting. Written and approved by the CTO.

## What went wrong overnight (11-03 20:56 to 11-04 10:22)

**Mostly Paperclip, and no rule can fix that part.** When an agent reassigns the task its own run holds, Paperclip cancels the run and then queues the wake for the new owner. For most of these, the new owner never got a run.

| Route, all history to 11-04 10:22 | New owner's run within 2 minutes |
|---|---|
| Agent reassigns the task its run holds | **11 of 36** |
| Agent reassigns from a run on another task | 4 of 4 |
| Task created with an agent owner | **27 of 27** |
| Blocker resolved, the owner woken | 11 of 11 |

The 25 lost wakes don't line up with the target being busy, the status, or a comment on the `PATCH`. The agent API doesn't show wake records, so the exact branch in Paperclip is unproven. It should be raised with Paperclip's maintainers.

Every board comment and wake in the window, by cause:

| Cause | Cases | Rescues |
|---|---|---|
| **No run after the reassign** (the sender's run was cancelled) | PAD-26 to QA and to CTO; PAD-18 to CTO (the 22:52 QA report); PAD-23 to QA and to CTO; PAD-20 to QA and to CTO; PAD-19 to QA twice and to CTO; PAD-37 to CTO | 11 |
| **Wake sent, run cancelled** | The CEO's runs on PAD-18 were cancelled twice (`issue_assignee_changed`), because a card on a task someone else holds doesn't get a run through | 1 |
| **Owner woke and stopped, with nothing to wake them again** | PAD-29: a Claude Code wakeup died with the run (exit 143), so nothing fired from 05:20 until the board at 10:00. PAD-19: `blocked` with no signal for the red `e2e`. PAD-23 had this too: QA handed it over at 21:13 to wait for the runner, with no monitor | 2 |
| **Nothing stuck** | PAD-39, PAD-40, PAD-43 (normal queue, misread as a fault); PAD-27, PAD-35, PAD-36, PAD-30, PAD-44, PAD-48, PAD-41 (things only a person can do, or a decision); PAD-22 at 07:30 (a note); the 21:13 merge notes; PAD-33 (a decision) | 0 |

That's 14 rescues at task level, in 7 rounds by the board (22:11, 01:12, 01:30, 02:00, 02:30, 03:30, 10:00), with 04:00 as a judgement call. The founder's "about 8" fits the rounds.

The written rule made the wait problem worse: it told agents to keep the task `in_progress` and let "your next heartbeat" pick it up. A, B and QA have no timer, so no next heartbeat comes.

## The change

1. **A hand-off is a new child task, not a reassign.** It takes the route that worked 27 of 27 times, and the sender's run survives, so **the sender can check it landed**. The sender then blocks on the child, and the blocker wake brings it back. This changes the suggested "reassign as the last action" because that route is the one losing wakes. It stays only for handing a task over for good.
2. **Waiting uses a Paperclip issue monitor.** Background commands and Claude Code's own wakeups die with the run.
3. **A safety net whose run survives:** the CTO's hourly routine runs `scripts/ops/handoff-check.mjs` and comments on anything stranded, which wakes the owner.

Cost: about two more short runs per PR, against QA's 10 of 12 runs being cancelled today. The routine adds up to 24 short CTO runs a day and skips quiet hours.

## The measure

`node scripts/ops/handoff-check.mjs --since <iso>` (read-only; any agent run can use it).

- **Stranded hand-off:** a task gets an agent owner, by reassign or by creation, and the owner has no run within 30 minutes, with no blocker or pending card to explain it.
- **Rescue:** a board comment or action that wakes, re-routes or closes a task because its owner wasn't moving. Decisions and answers don't count.
- **It worked if:** from the time it's live, stranded hand-offs are found by us and not by the board, and rescues fall well below 8 per night. Reported at 24 hours.

Changes from the founder's first draft, and why:

- **Created tasks count as hand-offs.** Otherwise the new route would be invisible.
- **A board wake doesn't count as landing.** Otherwise a rescue inside 30 minutes hides the stranding: 5 of last night's 9 were like that.
- **Silent waits are listed too:** `in_progress`, nothing running, no monitor. PAD-29 stranded this way without changing owner.
- **Board wakes are counted exactly** from `heartbeat.invoked`. Comments can't be classified by a script, so they're listed for a person, and a `Rescue:` prefix makes them countable, as the Team-on plan asks.

**Before the fix, same script:** 36 hand-offs, 24 landed, 3 explained, **9 stranded**, 11 board wakes. PAD-37 sat `blocked` on a backward link, so the definition excludes it, though it was rescued too.

## Also found

The rules in each agent's Paperclip instructions had moved ahead of `docs/agents/_rules.md`: the `Founder:` task section, the background-task rule and `Stopping processes` were only live, and QA's mission line differed. New hires get `_rules.md`, so they'd have started without them. This PR brings them into the file, and each agent's instructions become its role file plus `_rules.md` again.
