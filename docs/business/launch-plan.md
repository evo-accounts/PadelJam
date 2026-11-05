# Launch plan

Goal: PadelJam, free, public on the App Store and Google Play in Portugal and Brazil in **January 2027**, in pt-PT, pt-BR and en, with the privacy policy and terms human-reviewed. Billing, paid tiers and the club dashboard are not in this plan.

_Owner: Head of Business. Draft v2, 2026-11-05. Follows `docs/company/roadmap.md`. Nothing here has been sent, bought or published; items marked **Founder** need the board (gates in `docs/agents/_rules.md`)._

## 1. The date

| | Date |
|---|---|
| Feature freeze (fixes only) | Mon 2026-12-28 |
| **Last safe submission to both stores** | **Fri 2027-01-08** |
| **Target public date** | **Tue 2027-01-19** |
| Latest public date that is still "January" | Fri 2027-01-29 |
| Decision on the beta fallback | **Fri 2026-12-18** (final check Mon 2027-01-04) |

How the dates are worked back. Store review times are reported by third parties and **not confirmed**; Google's rules are confirmed by Google's own pages (sources below).

- **Apple review: 1–3 days typical, up to 7 for a first app.** A first submission often gets one rejection (privacy label, sign-in, metadata). **What 01-19 assumes:** typical review with at most one rejection (about 3 days, a fix, and 3 days again, so roughly 01-16). Two full 7-day rounds land on **01-22**, which is inside January but past the target. We hold 01-19 for the typical case and say so; we do not promise it for the slow case. Not confirmed: the founder's Apple Developer account state and whether it is an organisation (D2).
- **Google Play.** If the developer account is a **personal one created after Nov 2023, production access requires a closed test with at least 12 testers opted in for 14 continuous days**, then an access review (reported as usually within 7 days; not confirmed). Organisation accounts are not subject to the closed-test rule. A tester dropping out below 12 and a rejected access request are both reported to restart the test, so we leave room:
  - **Closed test starts: target Mon 2026-12-07, latest Thu 2026-12-10.** 14 days ends 12-21 (target) or 12-24 (latest); 7 days of access review ends 12-28 or 12-31; production is open before 01-08 either way.
  - Starting on 12-18, as v1 said, would end the 14 days on 01-01 and the review on 01-08, with no room for anything. That is why it moved.
  - Honest limit: a restart late in the 14 days (after about 12-20) still misses 01-08. Mitigation: recruit 18–20 testers for 12 required, and keep them active.
  - Before the test starts, the **Play Data safety form must be filled in** (it applies to closed tracks; internal testing is exempt) and a build must be on the closed track. Both are in the checklist before 12-07.
- **Human legal review of privacy policy and terms (PT and BR): 10 working days, plus a revision round of 5.** Counted with PT holidays (Tue 12-01, Tue 12-08, Fri 12-25) and BR holidays (none between 11-25 and 12-18):
  - drafts due **Thu 11-19**, at the reviewer **Wed 11-25** (the founder reads them in between);
  - first-round comments back by **Fri 12-11** (10 working days: 11-26, 27, 30, 12-02, 03, 04, 07, 09, 10, 11);
  - revision round **12-14 to 12-18** (5 working days); changes applied and signed off **Fri 12-18**. There is no slack in this window, so a slip in the draft date moves everything.
  - Not confirmed: who the reviewer is, their availability, and their cost (founder, gate 4).
- Listings in three locales, screenshots and the privacy label are needed at submission. Listing **drafts 12-07, final 12-21** (the policy URL in them is live on 12-21).

If any of these slips past its date, we do not move 01-19 quietly. See section 3.

Sources for the store rules: [Play: testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB); [Play: Data safety](https://g.co/play/datasafety). Store-readiness details: PR #314 `docs/handoff/store-readiness-gap-list.md` (Release & Ops; items cited below as I/A/X numbers; the file lands with that PR).

## 2. Checklist

PT = Portugal, BR = Brazil, both = shared. **One accountable owner per row**; helpers do part of it. Owners are people or agents who exist today. Roles not yet hired (Legal, Growth, Designer) are written as "→ Legal" etc.: the named owner does the row now and hands it over when the role joins. Where a role's rules forbid the current owner from the work (legal text, gate 5), the row says who decides. Dates are targets. HoB = Head of Business, R&O = Release & Ops, PM = Product Manager, CTO.

### Open now

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 1 | Level privacy-policy line and store labels settled ([PAD-65](/PAD/issues/PAD-65)); blocks any build that collects Level ([PAD-64](/PAD/issues/PAD-64)) | both | Founder | HoB | 11-13 |
| 2 | iOS build with the redesign to TestFlight internal. Gate 1 (EAS build and upload). Needs #1 settled. No build has the redesign today (I1) | both | Founder | R&O writes the steps | 11-20 |
| 3 | iOS device pass on that build ([PAD-32](/PAD/issues/PAD-32)); findings triaged in [PAD-31](/PAD/issues/PAD-31). Needs #2 | both | PM | Founder (device) | 11-27 |
| 4 | Pre-0147 invitations ([PAD-99](/PAD/issues/PAD-99)) | both | CTO | | 11-20 |
| 5 | Runner reliability ([PAD-98](/PAD/issues/PAD-98)); numbers on 11-11 ([PAD-51](/PAD/issues/PAD-51)) | both | CTO | | 11-11 |
| 6 | PM launch-ready checklist per area ([PAD-120](/PAD/issues/PAD-120)). Open input: this plan does not wait for it; items 17–25 are reconciled with it when it lands | both | PM | | 11-12 |

Done and dropped: [PAD-56](/PAD/issues/PAD-56) and [PAD-97](/PAD/issues/PAD-97).

### Accounts and legal footing

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 7 | Account types and states (D2): Apple Developer and Google Play account type, organisation verification, Apple signing and capabilities (I3), Play app record and package claimed (A4) | both | Founder | HoB lists the screens to check | type 11-13; console state 11-20 |
| 8 | Choose the legal reviewer(s) for PT and BR, and their cost (D3, gate 4) | both | Founder | HoB drafts options by 11-10 | 11-13 |
| 9a | Data inventory: what we collect, where, who sees it. Includes Supabase, Stream, Resend, **Sentry** (A24); verify Twilio SMS, push (Expo, APNs, FCM) and Apple and Google sign-in | both | HoB | CTO confirms against code | 11-13 |
| 9b | Privacy policy and terms drafts, pt-PT, pt-BR, en. GDPR for PT; LGPD for BR (controller, legal basis, transfers to the Supabase region, data-subject rights, DPO or contact). Legal text is gate 5 and no agent on the team may write it. **The founder is accountable and decides who drafts**: → Legal if the hire is on by **11-13**; if not, **the founder chooses by Mon 11-16** another route, for example the reviewer drafts from the existing pages (more cost, same 11-25 hand-over) | PT, BR | Founder | HoB supplies #9a; → Legal | draft **11-19**; to reviewer **11-25** |
| 10 | Human legal review: round 1 back 12-11; revision round; signed off and applied | PT, BR | Founder | reviewer | **12-18** |
| 11 | **Revise and localise the live pages.** `/privacy` and `/terms` already exist in `apps/web/src/app/(public)/`: the policy is dated 4 July 2026, English only, and names Supabase, Stream and Resend (not Sentry). Work: pt-PT, pt-BR and en routing and strings; reviewed text dropped in. Founder approves publishing (gate 5) | both | CTO | | structure 12-04; publish 12-21 |
| 12 | **Play Data safety form, before the closed test**, from #9a, using the current live policy URL; updated after review (see 13). Gate 5 | both | HoB (draft by 11-27) | Founder enters | enter by **12-03** |
| 13 | After #10 and #11: Apple privacy nutrition label (I11), and Play Data safety update. Depends on the final policy text | both | HoB (draft) | Founder enters | 12-21 |
| 14 | Account deletion path (both stores) verified in app and on the web; Play needs a web URL (I8, A26) | both | CTO | | 12-11 |
| 15 | Confirm `support@padeljam.app` (named in the current policy) receives and answers mail; a support page (`/help` exists) | both | Founder | | 11-27 |
| 16 | Age rating questionnaires (both stores), content rights, export compliance (declared exempt) | both | HoB (draft) | Founder enters | 12-21 |

### Builds and store readiness

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 17 | First Android build (development profile) to learn whether Android compiles at all (A1). Gate 1 | both | Founder | R&O steps; CTO fixes | 11-20 |
| 18 | Android production build, Play App Signing, first upload by hand to the closed track (A3, A4, A5, A23); Data safety (#12) first | both | Founder | R&O, CTO | **12-03** |
| 19 | **Play closed test** (12 testers x 14 days) if the account requires it. Cohort chosen in D5 | both | Founder | HoB prepares tester list and invite wording (not sent) | **start 12-07, latest 12-10** |
| 20 | Store code gaps from #314: reviewer account that needs no SMS (I5, A28), permission strings (I6), report and moderation path (I12, A25), push credentials and Android push (I4, A2, A6) | both | CTO | Founder for hosted seed (gate 2) and credentials | 12-11 |
| 21 | Real SMS: Twilio, Brazil sender registration has a long lead time (X2) | both | Founder (gate 4) | CTO | start 11-20; done 12-11 |
| 22 | Launch blockers from the checklists fixed; unfinished areas hidden, not finished late | both | CTO | | **12-21** |
| 23 | Release candidate: the fixed build to TestFlight internal and Play internal. Gate 1 | both | Founder | R&O | 12-22 |
| 24 | Device pass on the fixed RC, iOS and Android | both | PM | Founder, QA | 12-24 |
| 25 | Feature freeze | both | CTO | | 12-28 |

### Listings and content

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 26 | Listing copy (name, subtitle, description, keywords, what's new) in pt-PT, pt-BR, en; BR keywords researched separately from PT. Nothing is sent by us | PT, BR | HoB | → Growth | draft 12-07; **final 12-21** |
| 27 | Screenshots and preview per locale and device size, from seeded demo data. Shot list first | both | R&O | CTO captures on the runner; → Designer | list 12-04; done 12-14 |
| 28 | Help articles for core flows in three locales | both | PM | → Growth | 01-05 |
| 29 | Brand and name check: store-name availability and a public-register search in PT and BR (INPI, EUIPO). This is a search, not a legal opinion; filing a trademark is spend (gate 4) and is the founder's call | PT, BR | HoB | → Legal | 12-04 |
| 30 | Support replies and review-reply templates (drafts only) | both | HoB | → Growth | 01-05 |

### Submit and launch

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 31 | Submission pack: builds, listings, labels, review notes, demo account for reviewers (I16) | both | HoB | R&O checks | 01-04 |
| 32 | **Submit to both stores** (gate 3) | both | Founder | | **01-08** |
| 33 | Answer reviewer questions and rejections within 24 h | both | HoB drafts | Founder sends | 01-08 → release |
| 34 | Release: manual release on both stores, same day, PT and BR | both | Founder | | 01-19 |
| 35 | Launch-day monitoring and first-week hotfix path | both | CTO | | 01-19 → 01-26 |
| 36 | Waitlist and announcement drafts (nothing sent by us) | PT, BR | HoB | → Growth; Founder sends | draft 01-05 |

## 3. Outside our control, and the fallback

| Dependency | Why we can't control it | Early signal | Decision date |
|---|---|---|---|
| Apple review | Timing and rejections are Apple's | Rejection or "in review" over 3 days | After submission |
| Google Play: the 12-tester / 14-day rule and access review | Google's policy and timing | Account type unconfirmed after 11-13; Data safety form or closed-track build not done by 12-03; **closed test not started by 12-07 (amber), by 12-10 (red)** | **12-18** |
| Human legal review | Reviewer's availability over the holidays | No legal drafter confirmed by 11-16; drafts not at the reviewer by 11-25; no first-round comments by 12-11 | **12-18** |
| Founder-only steps (accounts, uploads, submission, label entry) | Single human, gates 1, 3, 4, 5 | Any founder task open more than 3 days past due | Weekly |
| Mac / runner capacity | Single laptop runner | [PAD-51](/PAD/issues/PAD-51) numbers on 11-11 | 11-11 |

**What the fallback is.** Instead of the public release, we ship a **beta**: external TestFlight (iOS) and the Play closed-testing track (Android), and say so.

**12-18 trigger, checkable that day.** The CEO takes the fallback to the founder on 12-18 if any of these is true at the end of that day:
- the reviewer's sign-off is not received and the changes are not applied (#10);
- the Play closed test has not been running with at least 12 testers opted in since 12-10 or earlier (day 8 of 14 on 12-18), or the account type is still unconfirmed;
- the fixed RC (#22–#24) is not on track for the 12-24 device pass.

**What 12-18 starts.** Because the beta is cheap to prepare and the public path is not, on 12-18 we prepare both: the external TestFlight build is submitted for **Apple's beta app review** on **12-23** (first external builds need this review; typically a day or two, unconfirmed, so we plan up to 7 days), together with the RC (#23). It needs a privacy policy URL, a beta description, a feedback address and the reviewer account (#20). The Play closed track already runs from 12-07; wider testers are added by a track update submitted 12-28.

**Beta available: Mon 2027-01-11.** That allows 7 days of Apple beta review from 12-23, with a few days for one resubmission. Invitations are sent by the founder (gate 3).

**01-04 final check: what it can decide.** On 01-04 the CEO and founder choose one of two:
1. **Submit publicly on 01-08.** Only if all hold: legal review signed off and applied; Play production access granted, or not required; RC device pass done on the fixed build with no open launch blocker; the submission pack (#31) is complete.
2. **Do not submit; go beta.** If any one fails, the public submission is held, the beta goes out on 01-11, and a new public date is a separate founder decision.

A public date is only moved by an explicit founder decision recorded on a task. The plan is never edited silently: any date change gets a dated line in the change log below.

**Which policy text a beta runs on, if legal review is the reason (gate 5, founder decision, D6).** Options: (a) the live 4 July policy, unchanged: it is English only and omits Sentry, so it does not describe the app accurately; (b) a provisional revised text, published only if the reviewer has cleared its data-practice statements, marked as beta; (c) the live policy plus a minimal addition (Sentry and the missing languages' summary), approved by the founder. Recommendation: **(b) if the reviewer will clear it in time, otherwise (c)**; never (a). Testers are invited only after the chosen text is live.

## 4. What Legal and Growth will need (written down, not done)

Both are planned for about 11-12 and are not confirmed.

**Legal**
- The data inventory (#9a): profile, Level, location, chat (Stream), email (Resend), diagnostics (Sentry), database and auth (Supabase), push tokens, analytics if any. HoB assembles it from the code by 11-13.
- Which reviewer, which jurisdiction (PT and BR counsel), cost and turnaround. Founder decision (D3).
- Dates: draft 11-19, at the reviewer 11-25, round 1 back 12-11, signed off 12-18.
- Open question for the reviewer: LGPD representation and a DPO contact, and transfers to the Supabase region.
- Store labels depend on the final policy text (#13); the Play Data safety form is entered earlier (#12) and updated after.

**Growth**
- Locale rules: pt-PT and pt-BR copy are separate; keywords researched per market.
- Inputs: final app name, one-line positioning, screenshots, and a decision on whether a waitlist exists and where it is.
- Drafts for listings (#26), help articles (#28), review-reply and support templates (#30), announcement (#36). All sending stays with the founder.
- A launch-week measurement list. Needs the tracking plan to exist first.

**Designer**
- Screenshot and preview production (#27) and the adaptive-icon check (A13).

## 5. Founder decisions

Each is written so it can be answered cold.

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| D1 | What does the privacy policy say about the padel **Level** a player enters, and what do the store labels say ([PAD-65](/PAD/issues/PAD-65))? | Disclose Level as profile data, not shared with third parties; state it in the policy before any build collecting it ships | **11-13** |
| D2 | What Apple Developer and Google Play accounts exist, of what type (personal or organisation), and created when? **Biggest schedule risk:** a Google personal account created after Nov 2023 needs the 14-day closed test. If an account is missing, create it now (Apple and Google fees are spend, gate 4). An organisation account needs verification (D-U-N-S and documents) that has its own lead time, reported as days to weeks and not confirmed; it avoids the 14-day test, so compare both routes on 11-13 | Check both accounts today. If Google is personal, plan the closed test as in #19. If an account is missing or needs organisation verification, start it that day and tell the CEO, because the 12-07 and 01-08 dates then need re-checking | **11-13** |
| D3 | Who reviews the privacy policy and terms for PT and BR, and what is the budget (gate 4)? | One reviewer who covers both PT and BR, or two if none does. Book now: drafts reach them 11-25 and the window has no slack. Also say who drafts if Legal is not hired by 11-16 (#9b) | **11-13** |
| D4 | Is **2027-01-19** the target public date, with 01-29 the latest "January" date? | Approve as target. It assumes at most one store rejection (section 1) | 11-27 |
| D5 | Who are the 12+ testers for the Play closed test? | Padel clubs and players you already know, in PT and BR; 18–20 names for 12 required | 11-27 |
| D6 | If gates slip, do we ship a beta instead of public, and which policy text does a beta run on (gate 5)? | Pre-approve the beta (section 3), so 12-18 is an announcement, not a debate. Policy text: option (b), else (c); never the unchanged live policy | **11-27** |
| D7 | Is `support@padeljam.app` (named in the current policy) a mailbox that works and who reads it? | Confirm it, or name another role address on the company domain | 11-27 |

## 6. Open inputs

- PM: launch-ready checklist per area ([PAD-120](/PAD/issues/PAD-120)). Not awaited; reconcile when it lands.
- Release & Ops: store-readiness gap list, PR #314 (`docs/handoff/store-readiness-gap-list.md`). Items 17–25 already follow it; reconcile when it merges, in particular the gaps not yet given a row (I14 and A20 deep links, A9–A19 Android device items, I10 iPad screenshots).

## Change log

- 2026-11-05: v1.
- 2026-11-05: v2 (PAD-124, review of #313). Legal review re-dated (drafts 11-19, reviewer 11-25, 12-18 sign-off, with PT holidays); Play closed test moved to target 12-07, latest 12-10; Data safety form moved before the test; order fixes (labels after final text, iOS build row added, RC pass after blockers, listings final date); one owner per row with helpers, and interim owners for Legal, Growth and Designer rows; fallback given a beta date (01-11), a 12-18 trigger and 01-04 criteria; legal pages recognised as existing; rows for #314 and the Sentry inventory item added; PAD-56 and PAD-97 dropped; founder decision dates set (D2, D3 11-13; D4, D5, D6, D7 11-27). Rows renumbered.
