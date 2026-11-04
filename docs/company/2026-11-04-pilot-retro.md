# Pilot retro and go/no-go, 2026-11-04

Pilot: 2026-10-30 to 11-04. Agents: CEO, CTO, Engineer A, Engineer B, QA. Written a day ahead of the roadmap's ~11-05, using the data as of about 01:30 UTC on 11-04.

## The call

**Go, in stages, for the non-engineering team. No more engineers yet.** Adding agents is the founder's decision (gate 7), so this was my recommendation, on [PAD-33](/PAD/issues/PAD-33). **The founder accepted it with two additions;** see the update below.

- **~11-06:** PM, Release & Ops, Head of Business.
- **~11-12:** Designer, Legal, Growth, if there are still no usage-limit stops.
- **Engineer C stays off.** No Xcode on the agents Mac.

**Why not wait for the engineering pipeline to be proven?** Launch is about 8 weeks away. The launch plan, the launch-ready checklist and the store gap list don't exist yet, and the first three roles write them. Those roles don't use the runner, QA or the merge queue, which is where the pilot got stuck. **Why not all six at once?** There's no capacity data above five agents on a subscription shared with three other companies.

## What the pilot set out to prove

| Charter proof point | Result | Evidence |
|---|---|---|
| Backend → web → mobile hand-off on one branch | **Not proven** | The CTO found both clients already showed the three error codes, so no Engineer B task existed ([PAD-3](/PAD/issues/PAD-3)). The right call for the task, but this hand-off never ran. |
| Web E2E on the agents Mac, away from port 3100 | **Proven, narrowly** | `WEB_PORT=3201`, 6/6 ([PAD-5](/PAD/issues/PAD-5)). Those specs are auth and example only, so they don't touch Create Event. |
| A mobile change caught by the founder's runner | **Not proven** | No agent-built app code has merged. The runner has caught no product bug so far. |
| Gate 2: agents prepare a hosted migration, founder applies it | **Proven** | 0146 and 0147 applied and verified on the objects ([PAD-10](/PAD/issues/PAD-10)), after two rounds on the check queries and a missing history row. |

Also proven: plan → build → QA → review → merge ran twice on backend work ([PAD-3](/PAD/issues/PAD-3), [PAD-6](/PAD/issues/PAD-6)). QA's red-first run on 0147 showed the new test really fails on the old function. Engineer A's work also surfaced a real adjacent bug, which became 0147.

## What worked

- **The gates held.** A scan of the 143 PadelJam run logs with Bash commands found no agent running `supabase link`, `db push`, `functions deploy`, `eas`, `vercel` deploys or requests to the hosted project, and no agent push to `main`. The scan only covers logged Bash commands.
- **Security fixes reached production.** 0146 and 0147 are live.
- **Scope stayed under control.** The CTO cut the unneeded mobile task, and onboarding was reduced to the post-signup steps.
- **Agents found work beyond the brief.** 0147, and the #81 chat fix on #298.

## Where it got stuck

| Hand-off | What happened | Cost |
|---|---|---|
| Engineering → mobile E2E | Port collisions on 55321, then simulator wedges, then the real cause: the Mac was overloaded (load ~400, swap 6.5/8 GB). I first blamed the simulator and corrected that on 11-03. | Biggest delay. #294 waited from 11-02 19:09 to 11-03 22:47. **2 green of the last 14 runs** at the time (9 failed, 3 cancelled), some of them PAD-11's own debugging. See the update below. |
| QA → CTO | #294's first QA hand-off never started. QA's pass on 11-03 at 22:52 didn't result in a CTO run, and the board found it at 01:12. | About 2 hours overnight, and the board had to step in. |
| Agents → founder | The token for agent pushes held #292 from 10-31 to 11-01. [PAD-25](/PAD/issues/PAD-25) and [PAD-27](/PAD/issues/PAD-27) exist because agent tokens can't change workflows or re-run jobs. | Every runner problem needs a person. |
| CTO → founder, hosted SQL | The Supabase editor shows only the last statement's result, and the history row for 0146 was missing. | One extra round. The migrations workflow should remove this. |
| Migrations workflow | `chore/supabase-migrations-workflow` exists only on this Mac, with no PR. #295 (`profiles.level`) waits on it. | **Now next in line behind #294.** Routed to the CTO. |
| Task state vs reality | [PAD-21](/PAD/issues/PAD-21) is `done` with #295 open. [PAD-14](/PAD/issues/PAD-14) is `blocked` with its README already on `main`. [PAD-18](/PAD/issues/PAD-18) sat `in_review` with no wake path. | The status list can't be trusted without checking GitHub. |
| CEO (mine) | No task covered the retro until the board created one. #297 grew to 15 commits with no owner routing it. My timer runs have no task context. | I should have routed both earlier. |
| Merge order | #292 merged with `e2e` waived by the board, and #296 merged ahead of QA's Part B on the founder's go-ahead. Both were said openly and were reasonable, but neither went through the normal check. | Part B ([PAD-23](/PAD/issues/PAD-23)) is still open. |

**Runs:** 152 total: 117 succeeded, 31 cancelled, 3 running, 1 failed (`claude_auth_required`, on setup day). 27 of the 31 cancellations came from a change of task owner, mostly agents handing off, so they don't generally mean lost work. QA shows it most: 10 of 12 runs cancelled. It's also how the 22:52 report came to be stranded.

## Usage limits

**No stops.** No run failed on a limit, and a search of PadelJam's run logs for limit messages found nothing. This covers five agents only.

## Spend

Paperclip shows **$0**: everything runs on the shared subscription, so dollars aren't measured. Recorded tokens:

| Agent | Receipts | Input | Cached input | Output |
|---|---|---|---|---|
| CEO | 23 | 1.8M | 19.6M | 0.17M |
| CTO | 64 | 7.4M | 169.9M | 1.01M |
| Engineer A | 4 | 0.27M | 3.3M | 0.03M |
| Engineer B | 2 | 0.07M | 0.78M | 0.006M |
| QA | 0 | none | none | none |

**This is incomplete:** there are 93 receipts for 152 runs, 19 runs are pending, and QA has none. On what's recorded, the CTO is about 85% of usage, so CTO polling is the first place to look if limits start to bite. The data isn't good enough to set real budget caps, so I'd keep the $10 warning caps for now.

## Did the mobile E2E catch anything the agents missed?

**Not yet, and we can't say it would.** No failure so far has been traced to a product bug. #298's latest failure looks like the runner, but that isn't proven. On a runner this unreliable, a real regression could be mistaken for a flake, so #294's 139/139 is a good sign and not yet a track record.

## Still open from the pilot

Updated 11-04 10:30 UTC.

| Check | Owner | Status |
|---|---|---|
| First agent-built mobile code through the runner | CTO | **Done.** #294 merged at 01:31 on 11-04. |
| [PAD-23](/PAD/issues/PAD-23) Part B on `main` | QA | Closed |
| #298 merged | CTO | Merged with `e2e` waived for that PR ([PAD-44](/PAD/issues/PAD-44)), not on a green run |
| Runner stability | CTO | Not met; see the update below |
| First migration through the workflow (#295) | CTO, founder | #300 open, founder steps in [PAD-36](/PAD/issues/PAD-36) |
| Backend → web → mobile hand-off on one branch | CTO | Accepted as unproven until a feature needs it. I wouldn't invent a task to prove it. |

## Xcode on the agents Mac

**Not now.** The charter's trigger is mobile bugs getting past QA, and that hasn't happened. The Mac is shared with the runner, which is the machine that was overloaded. Revisit once agent-built mobile code has been shipping for a while. Meanwhile QA reads the diff and the unit tests: the CTO asked QA for a "real-device pass" on #294, which QA can't do.

## Instruction changes to make

The plan folds these into `docs/agents/`, which sits outside my lane. If the founder says go, I'll include them in the week-2 plan.

1. **`done` means merged.** A task with a PR stays open until the PR merges or the next owner holds it.
2. **Hand-offs go through a task the next owner is woken on,** and the owner checks that it landed. Reassigning cancels the current run, which is what stranded the 22:52 report. This may also be a Paperclip issue worth raising.
3. **Name what QA can't do.** No simulator and no device. The CTO's role should say so, and device checks go on the founder's pass.
4. **Keep the runner Mac free of heavy background apps,** and check its load before treating an `e2e` failure as code.
5. **A CEO routine for the status note,** so timer runs have a task.

## Update, 11-04 10:30 UTC: the founder's decision and corrected numbers

**Decision:** staged, with two additions ([PAD-33](/PAD/issues/PAD-33)). The plan is `docs/company/2026-11-04-team-on-plan.md`.
1. The hand-off fix must be live before the first group starts. Overnight the board had to wake agents about 8 times after reassignments.
2. The second group needs more than "no usage-limit stops": e2e reliability and hand rescues must not have got worse on the Mac.

**What I got wrong or left out:**
- **"2 green of the last 14" is out of date.** Since #296 merged it's **3 green of 9 finished attempts**, which I checked against GitHub. It also didn't separate causes: some of those failures are a real selector bug, not the Mac. That bug is in the tests (`02-onboarding` tapped an `OptionCard` as a `Button`), not in the app, so my answer above still stands: the E2E hasn't caught a product bug yet. Why the same selector passed on #301 hasn't been fully explained.
- **I treated the first group as a subscription question.** The Mac hosts 23 agents across four companies on 16 GB, so three more also share that memory. The first group therefore runs without timers, and memory is one of the measures.
- **"No usage-limit stops" was the wrong bar on its own.** The founder's is better.

**Causes of e2e failures, from [PAD-45](/PAD/issues/PAD-45):** high load alone doesn't fail suites. Environment-signature failures cluster when 2 or more agents are active (7 of 27 suites, against 1 of 69), over a few windows on one night. The cause of the `idb` timeouts isn't proven, and memory pressure is the best guess, with no memory history to test it.

**Also new:** Engineer B has four `adapter_failed` runs today and is in `error`. The logs show a background watcher being killed at the end of a run, which `_rules.md` already forbids. It isn't a usage limit, and it's in the hand-off task ([PAD-50](/PAD/issues/PAD-50)).

## Next

- **CTO:** the hand-off fix ([PAD-50](/PAD/issues/PAD-50), by end of 11-05) and the numbers ([PAD-51](/PAD/issues/PAD-51)).
- **CEO:** hire requests once the fix is live ([PAD-49](/PAD/issues/PAD-49)), then the second-group check ([PAD-52](/PAD/issues/PAD-52), 11-11).
- **Founder:** [PAD-32](/PAD/issues/PAD-32) (device pass), [PAD-36](/PAD/issues/PAD-36) and [PAD-46](/PAD/issues/PAD-46).
