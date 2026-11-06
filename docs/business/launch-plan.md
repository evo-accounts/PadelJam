# Launch plan

Goal: PadelJam, free, public on the App Store and Google Play in Portugal and Brazil in **January 2027**, in pt-PT, pt-BR and en, with the privacy policy and terms human-reviewed. Billing, paid tiers and the club dashboard are not in this plan.

_Owner: Head of Business. Draft v3.2, 2026-11-06. Follows `docs/company/roadmap.md`. Nothing here has been sent, bought or published; items marked **Founder** need the board (gates in `docs/agents/_rules.md`)._

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
  - Honest limit: a restart late in the 14 days (after about 12-18) still misses 01-08. Mitigation: recruit 18–20 testers for 12 required, and keep them active.
  - Before the test starts, the **interim corrected policy must be live (#11a, 12-03)**, the **Play Data safety form must be filled in** (it applies to closed tracks; internal testing is exempt) and a build must be on the closed track. All three are in the checklist before 12-07. If the interim policy is late, the form and the test slip with it; the hard limit is policy live by 12-09, for a 12-10 start.
  - **Sign-in during the test:** phone sign-in is hidden for launch (founder's choice on PAD-137: no Twilio spend), so testers use email or Google, with no allow-list. The founder removed the test phone logins from production on 11-05. See #19 and #44.
- **Human legal review of privacy policy and terms (PT and BR): 10 working days, plus a revision round of 5.** Counted with PT holidays (Tue 12-01, Tue 12-08, Fri 12-25) and BR holidays (none between 11-25 and 12-18):
  - drafts due **Thu 11-19**, at the reviewer **Wed 11-25** (the founder reads them in between);
  - first-round comments back by **Fri 12-11** (10 working days: 11-26, 27, 30, 12-02, 03, 04, 07, 09, 10, 11);
  - revision round **12-14 to 12-18** (5 working days); changes applied and signed off **Fri 12-18**. There is no slack in this window, so a slip in the draft date moves everything.
  - Not confirmed: who the reviewer is, their availability, and their cost (founder, gate 4).
- Listings in three locales, screenshots and the privacy label are needed at submission. Listing **drafts 12-07, final 12-21** (the policy URL in them is live on 12-21).

If any of these slips past its date, we do not move 01-19 quietly. See section 3.

Sources for the store rules: [Play: testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB); [Play: Data safety](https://g.co/play/datasafety). Store-readiness details: `docs/handoff/store-readiness-gap-list.md` on `main` (Release & Ops, merged from #314; items cited below as I/A/X numbers).

## 2. Checklist

PT = Portugal, BR = Brazil, both = shared. **One accountable owner per row**; helpers do part of it. Owners are people or agents who exist today. Roles not yet hired (Growth, Designer) are written as "→ Growth" etc.: the named owner does the row now and hands it over when the role joins. **Legal is not a hire:** it is a separate company the founder set up, reached through a `Legal:` task that Head of Business opens; "→ Legal" means that company. Where a role's rules forbid the current owner from the work (legal text, gate 5), the row says who decides. Dates are targets. HoB = Head of Business, R&O = Release & Ops, PM = Product Manager, CTO.

### Open now

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 1 | Level line live on `/privacy` ([PAD-64](/PAD/issues/PAD-64)). The line and the labels were **approved by the founder on 11-05 (PAD-65 settled)**; what is left is publishing it. PAD-64 is blocked only on [PAD-126](/PAD/issues/PAD-126) ([PAD-127](/PAD/issues/PAD-127) is done). Blocks any build that collects Level. The **full** store labels are still to do (#12, #13) | both | HoB | CTO publishes | 11-13 (needs a production deploy, see section 3) |
| 2 | iOS build with the redesign to TestFlight internal. Gate 1 (EAS build and upload). Needs #1 live. No build has the redesign today (I1). Also needs the iPad decision (#41) so `supportsTablet` is final | both | Founder | R&O writes the steps | 11-20 |
| 3 | iOS device pass on that build ([PAD-32](/PAD/issues/PAD-32)); findings triaged in [PAD-31](/PAD/issues/PAD-31). Needs #2 | both | PM | Founder (device) | 11-27 |
| 4 | Pre-0147 invitations ([PAD-99](/PAD/issues/PAD-99)) | both | CTO | | 11-20 |
| 5 | Runner reliability ([PAD-98](/PAD/issues/PAD-98)); numbers on 11-11 ([PAD-51](/PAD/issues/PAD-51)) | both | CTO | | 11-11 |
| 6 | PM launch-ready checklist per area ([PAD-120](/PAD/issues/PAD-120)). Open input: this plan does not wait for it; items 17–25 are reconciled with it when it lands | both | PM | | 11-12 |

Done and dropped: [PAD-56](/PAD/issues/PAD-56) and [PAD-97](/PAD/issues/PAD-97).

### Accounts and legal footing

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 7 | Account types and states (D2): Apple Developer and Google Play account type, organisation verification, Apple signing and capabilities (I3), the Supabase Apple provider live for native Sign in with Apple (I7), Play app record and package claimed (A4) | both | Founder | HoB lists the screens to check | type 11-13; console state 11-20 |
| 8 | Choose the legal reviewer(s) for PT and BR, and their cost (D3, gate 4) | both | Founder | HoB drafts options by 11-10 | 11-13 |
| 9a | Data inventory: what we collect, where, who sees it. Includes Supabase, Stream, Resend, **Sentry** (A24), and the items PAD-65 records as missing from the current policy: **gender, date of birth and map location** as data, **Twilio and Nominatim** as third parties. Also verify push (Expo, APNs, FCM) and Apple and Google sign-in | both | HoB | CTO confirms against code | 11-13 |
| 9b | Privacy policy and terms drafts, pt-PT, pt-BR, en. GDPR for PT; LGPD for BR (controller, legal basis, transfers to the Supabase region, data-subject rights, DPO or contact). Legal text is gate 5 and no agent on the team may write it. **The founder is accountable and decides who drafts.** Default: the separate Legal company (request [PAD-239](/PAD/issues/PAD-239) asks whether it can meet 11-19), with a human reviewer signing off. If Legal has not confirmed it can meet 11-19 by **Mon 11-16**, the founder chooses another route by that date, for example the reviewer drafts from the existing pages (more cost, same 11-25 hand-over) | PT, BR | Founder | HoB supplies #9a and opens the `Legal:` task; → Legal | draft **11-19** (full texts **and** the interim policy of #11a); to reviewer **11-25** |
| 10 | Human legal review: round 1 back 12-11; revision round; signed off and applied | PT, BR | Founder | reviewer | **12-18** |
| 11 | **Revise and localise the live pages.** `/privacy` and `/terms` already exist in `apps/web/src/app/(public)/`: the policy is dated 4 July 2026, English only, and names Supabase, Stream and Resend (not Sentry). Work: pt-PT, pt-BR and en routing and strings; reviewed text dropped in. Founder approves publishing (gate 5). Needs a production deploy on the publish day (Vercel, section 3). Agents can't reach the site, so the check that `padeljam.app` is live and `/privacy`, `/terms` and `/help` load (X3, unverified) is the **founder's, by 11-20** (founder task, question 5) | both | CTO | Founder (site check) | structure 12-04; publish 12-21 |
| 11a | **Interim corrected policy, live by 12-03**, before the Data safety form is entered and before any tester is invited. It names the data and processors listed in #9a (including gender, date of birth, map location, Twilio, Nominatim, Sentry) and replaces the 4 July text on `/privacy` until the reviewed text lands (#11, 12-21). **Text: gate 5, no agent writes it**; drafted by the route chosen in #9b, **approved by the founder**, published by the CTO (a production deploy on 12-03, see section 3). Reviewer pass: see the note below the table. Choice of text for the test is part of D6 | both | Founder (approves) | → Legal or the #9b drafter writes; CTO publishes | approve **12-02**; live **12-03** |
| 12 | **Play Data safety form, before the closed test**, from #9a, using the **interim policy URL (#11a)**; updated after review (see 13). Gate 5. PAD-65 settled only the Level line: the console state for the Play Data safety form is "not started", so the full form is still to do | both | HoB (draft by 11-27) | Founder enters | enter by **12-03**, after #11a is live |
| 13 | After #10 and #11: Apple privacy nutrition label (I11), and Play Data safety update. Depends on the final policy text. Console state "not started" for the App Store privacy label; the full label is still to do | both | HoB (draft) | Founder enters | 12-21 |
| 14 | Account deletion path (both stores) verified in app and on the web; Play needs a web URL (I8, A26) | both | CTO | | 12-11 |
| 15 | Confirm `support@padeljam.app` (named in the current policy) receives and answers mail; a support page (`/help` exists) | both | Founder | | 11-27 |
| 16 | Age rating questionnaires (both stores), content rights, export compliance (declared exempt) | both | HoB (draft) | Founder enters | 12-21 |

**Can the reviewer clear the interim policy by 12-03?** They get the drafts on 11-25, but the full review is 10 working days (comments 12-11), so the full review cannot finish by 12-03. The ask is a **narrow, fast pass on the interim text only**: a short factual statement of what we collect and who processes it, not the full policy. Ask for it when booking (D3) and request an answer by **12-02** (four working days after 11-25: 11-26, 27, 30 and 12-02, with 12-01 a PT holiday; not confirmed, and it adds cost, so the founder decides). **If the reviewer cannot do that**, the founder approves the text, and chooses if the reviewer cannot do it, on 12-02, after the reviewer's answer, between: publish the founder-approved interim text marked "interim, under review" (it only states facts from #9a, no new legal position) and invite testers; or hold the test, which slips day for day to the 12-10 latest start (policy live by 12-09). A closed test is never run on the unchanged 4 July text (D6).

### Builds and store readiness

_Row 21 (real SMS) is retired: phone sign-in is hidden for launch (PAD-137). The numbering keeps the gap._

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 17 | First Android build (development profile) to learn whether Android compiles at all (A1). Gate 1 | both | Founder | R&O steps; CTO fixes | 11-20 |
| 18 | Android production build, Play App Signing, first upload by hand to the closed track (A3, A4, A5, A23); Data safety (#12) first | both | Founder | R&O, CTO | **12-03** |
| 19 | **Play closed test** (12 testers x 14 days) if the account requires it. Cohort chosen in D5. **Testers are invited only after the interim policy (#11a) is live and the Data safety form (#12) is in.** **Sign-in during the test:** phone sign-in is hidden (#44), so the 18–20 testers sign in with **email or Google**, with no allow-list and no test phone numbers. Google sign-in on Android is untested (A7), so the CTO checks it on the first Android build (#17). Email sign-in depends on the Resend SMTP set-up, read as on in PAD-144 but not tested end to end | both | Founder | HoB prepares tester list and invite wording (not sent); CTO checks sign-in | **start 12-07, latest 12-10** |
| 20 | Store code gaps from #314 (report and moderation path moved to #45): reviewer account with **email and password** (I5, A28; no SMS involved), permission strings (I6), push credentials and Android push (I4, A2, A6) | both | CTO | Founder for Firebase/FCM credentials and the hosted seed (gate 2), **both to the CTO by 11-27** | 12-11 |
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
| 35 | Launch-day monitoring and first-week hotfix path. Hotfixes are gate 1, so each one needs the founder's approval | both | CTO | Founder (approves hotfixes) | 01-19 → 01-26 |
| 36 | Waitlist and announcement drafts (nothing sent by us) | PT, BR | HoB | → Growth; Founder sends | draft 01-05 |

### Gaps from the store-readiness list

Rows for the gaps in `docs/handoff/store-readiness-gap-list.md` that had none. One owner each.

| # | Item | Market | Owner | Helpers | Due |
|---|---|---|---|---|---|
| 37 | **Deep links scope decision (I14, A20).** Today share links are `mobile://` and do nothing for people without the app. Options: build universal links and Android app links (web `.well-known` files, entitlement, route; M), or defer to after launch and say so in the listing. PM decides, with the CEO. Recommendation: defer unless invites are the launch growth loop; if built, it must land before the 12-28 freeze | both | PM | CEO; Founder for the Play signing fingerprint | decision **11-20** |
| 38 | Deep links build, **only if #37 says build** (web files, entitlements, intent filters, fingerprint from #18) | both | CTO | Founder (fingerprint) | 12-11 |
| 39 | **Android device pass on the first Android build (A9–A19, A21): icons, keyboard, date picker, dynamic icon, permissions, calendar, maps, fonts, chat, push tap.** Run on the #17 development build from a PM checklist per area ([PAD-120](/PAD/issues/PAD-120)). The RC pass (#24, 12-24) is the confirming pass, too late to find these. Fixes go into #22. A30 is **decided: manual** on one or two physical devices. Founder says which Android devices exist by 11-13 (open question 2 of the gap list) | both | PM | Founder (device), CTO (fixes), QA | **12-04** |
| 40 | Target API level, merged manifest permissions and `versionCode` baseline (A29, A15, A23): read from the first Android build log and prebuild. **Needs the founder's #17 build log; if #17 slips past 11-20, this 11-27 slips with it** | both | CTO | R&O; Founder (build log from #17, 11-20) | 11-27 |
| 41 | **iPad decision (I10).** Either capture iPad screenshots or set `ios.supportsTablet: false`. Decided by PM, after the founder answers which tablets they want (open question 5 of the gap list); the CTO sets the flag. Recommendation: `false` for launch (no untested iPad layouts, no extra screenshot set). Must be decided before #2, since it changes the native build | both | PM | Founder (answer), CTO | decision **11-16** |
| 42 | Production environment check: `scripts/verify-production-env.mjs` and `schema:check` pass against the hosted project (X1). Founder or CI only | both | Founder | CTO | 12-22, again 01-04 |
| 43 | Refresh the setup guide `docs/handoff/padeljam-remaining-setup.*`: which steps are done, Android steps added (X6). Uses the answers from #7 | both | R&O | Founder | 11-27 |
| 44 | **Hide phone sign-in in the app** (PAD-137: `hide`). Email and Google stay; no Twilio. Small PR; it is a launch blocker, so part of #22. **Date to be confirmed by the CTO** (task: [PAD-238](/PAD/issues/PAD-238)); the latest date to choose the hide was 11-26 in the launch-ready checklist, but it must land before #2 | both | CTO | | before #2, **11-20** |
| 45 | **Moderation path (I12, A25).** Nobody can read reports today (CTO gap 1). Covers reporting messages and posts as well as users, a way to read reports, and a named person who acts on them within 24 h (Apple is expected to look for it). Who: D9, a `Founder:` task from the moderation task | both | CTO | Founder (names the person) | **12-11** |

## 3. Outside our control, and the fallback

| Dependency | Why we can't control it | Early signal | Decision date |
|---|---|---|---|
| Apple review | Timing and rejections are Apple's | Rejection or "in review" over 3 days | After submission |
| Google Play: the 12-tester / 14-day rule and access review | Google's policy and timing | Account type unconfirmed after 11-13; Interim policy (#11a), Data safety form or closed-track build not done by 12-03; **closed test not started by 12-07 (amber), by 12-10 (red)** | **12-18** |
| Human legal review | Reviewer's availability over the holidays | No legal drafter confirmed (the Legal company, or the founder's other route) by 11-16; drafts not at the reviewer by 11-25; no first-round comments by 12-11 | **12-18** |
| Vercel production deploys | #1 (11-13), #11a (12-03) and #11 (publish 12-21) each need a production deploy on a set day. Vercel has refused builds repeatedly since 11-05 ("Deployment rate limited"); the cause is unconfirmed, and agents can't see the Vercel account | A web PR refused by Vercel, or the 11-13 deploy not live; the limit still on at 11-27 | Check on **11-13**; plan the 12-03 and 12-21 deploys a day early; if still unresolved on 11-27, a founder task to read the Vercel usage page |
| Founder-only steps (accounts, uploads, submission, label entry) | Single human, gates 1, 3, 4, 5 | Any founder task open more than 3 days past due | Weekly |
| Mac / runner capacity | Single laptop runner | [PAD-51](/PAD/issues/PAD-51) numbers on 11-11 | 11-11 |

**What the fallback is.** Instead of the public release, we ship a **beta**: external TestFlight (iOS) and the Play closed-testing track (Android), and say so.

**12-18 trigger, checkable that day.** The CEO takes the fallback to the founder on 12-18 if any of these is true at the end of that day:
- the reviewer's sign-off is not received and the changes are not applied (#10);
- **if the account requires the closed test** (#19), it has not been running with at least 12 testers opted in since 12-10 or earlier (day 8 of 14 on 12-18);
- the account type is still unconfirmed;
- the fixed RC (#22–#24) is not on track for the 12-24 device pass.

**What 12-18 starts.** Because the beta is cheap to prepare and the public path is not, on 12-18 we prepare both: the external TestFlight build is submitted for **Apple's beta app review** on **12-23** (first external builds need this review; typically a day or two, unconfirmed, so we plan up to 7 days), together with the RC (#23). It needs a privacy policy URL, a beta description, a feedback address and the reviewer account (#20). The Play closed track already runs from 12-07; wider testers are added by a track update submitted 12-28.

**Beta available: Mon 2027-01-11.** That allows 7 days of Apple beta review from 12-23, with a few days for one resubmission. Invitations are sent by the founder (gate 3).

**01-04 final check: what it can decide.** On 01-04 the CEO and founder choose one of two:
1. **Submit publicly on 01-08.** Only if all hold: legal review signed off and applied; Play production access granted, or not required; RC device pass done on the fixed build with no open launch blocker; the submission pack (#31) is complete.
2. **Do not submit; go beta.** If any one fails, the public submission is held, the beta goes out on 01-11, and a new public date is a separate founder decision.

A public date is only moved by an explicit founder decision recorded on a task. The plan is never edited silently: any date change gets a dated line in the change log below.

**Which policy text testers run on (gate 5, founder decision, D6, needed 11-27).** D6 covers **both** the 12-07 closed test and any fallback beta. Options: (a) the live 4 July policy, unchanged: English only, omits Sentry, gender, date of birth, map location, Twilio and Nominatim, so it does not describe the app; (b) the interim corrected policy (#11a), live by 12-03, cleared by the reviewer's narrow pass; (c) the same interim policy, approved by the founder and marked "interim, under review", if the reviewer cannot clear it in time. Recommendation: **(b) if the reviewer can clear it by 12-02, otherwise (c)**; never (a). Testers are invited only after the chosen text is live. For the closed test that means 12-03; for a fallback beta it is whichever of the interim or the reviewed text is live then (the reviewed text from 12-21 if signed off). Whether the reviewer can clear it in time is set out under the Accounts table (#11a).

## 4. What Legal and Growth will need (written down, not done)

Legal is a separate company the founder set up, reached through `Legal:` tasks that Head of Business opens (PAD-239 asks whether it can meet 11-19). Growth is planned for about 11-12 and is not confirmed. The founder stays accountable and approves publishing (gate 5); a human reviewer signs off.

**Legal**
- The data inventory (#9a): profile (including **gender and date of birth**), Level, location (including **map location**), chat (Stream), email (Resend), SMS (**Twilio**, kept until the CTO confirms against the code whether phone sign-in leaves any Twilio data flow), geocoding and place search (**Nominatim**), diagnostics (Sentry), database and auth (Supabase), push tokens, analytics if any. PAD-65 records that the current policy omits gender, date of birth, map location, Twilio and Nominatim. HoB assembles it by 11-13; **the CTO still confirms it against the code**.
- The interim corrected policy (#11a) is drafted from this inventory and goes to the reviewer with the full drafts on 11-25, with a request for a fast narrow pass.
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

_D1 is retired: PAD-65 was settled by the founder on 11-05. D8 is retired: the founder chose `hide` for phone sign-in on 11-05 (PAD-137), so there is no Twilio spend. The numbering keeps both gaps (D2–D7 unchanged) so earlier references still point at the same decision._

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| D2 | What Apple Developer and Google Play accounts exist, of what type (personal or organisation), and created when? **Biggest schedule risk:** a Google personal account created after Nov 2023 needs the 14-day closed test. If an account is missing, create it now (Apple and Google fees are spend, gate 4). An organisation account needs verification (D-U-N-S and documents) that has its own lead time, reported as days to weeks and not confirmed; it avoids the 14-day test, so compare both routes on 11-13 | Check both accounts today. If Google is personal, plan the closed test as in #19. If an account is missing or needs organisation verification, start it that day and tell the CEO, because the 12-07 and 01-08 dates then need re-checking | **11-13** |
| D3 | Who reviews the privacy policy and terms for PT and BR, and what is the budget (gate 4)? | One reviewer who covers both PT and BR, or two if none does. Book now: drafts reach them 11-25 and the window has no slack. Also say who drafts if the Legal company can't meet 11-19 (#9b, 11-16) | **11-13** |
| D4 | Is **2027-01-19** the target public date, with 01-29 the latest "January" date? | Approve as target. It assumes at most one store rejection (section 1) | 11-27 |
| D5 | Who are the 12+ testers for the Play closed test? | Padel clubs and players you already know, in PT and BR; 18–20 names for 12 required | 11-27 |
| D6 | If gates slip, do we ship a beta instead of public? And which policy text do testers run on, for **both** the 12-07 closed test and any fallback beta (gate 5)? | Pre-approve the beta (section 3), so 12-18 is an announcement, not a debate. Policy text: the interim corrected policy (#11a), live 12-03, option (b) if the reviewer clears it by 12-02, else (c); never the unchanged live policy | **11-27** |
| D7 | Is `support@padeljam.app` (named in the current policy) a mailbox that works and who reads it? | Confirm it, or name another role address on the company domain | 11-27 |
| D9 | **Who reads user reports** (new, from the CTO). The app lets people report users, but nobody can read the reports today (#45). The CTO builds the screen by 12-11; a person has to read reports and act, within 24 h | You, at launch, until a support role exists. Name someone else if you prefer | **11-27** |

## 6. Open inputs

- PM: launch-ready checklist per area ([PAD-120](/PAD/issues/PAD-120)). Not awaited; reconcile when it lands.
- Release & Ops: store-readiness gap list (`docs/handoff/store-readiness-gap-list.md`, merged to `main` from #314). Every gap now maps to a row or is left out on purpose:
  - **Rows added:** I14 and A20 deep links (#37, #38); A9–A19 and A21 Android device items (#39); A29, A15, A23 (#40); I10 iPad (#41); X1 (#42); X6 (#43); X3 in #11.
  - **Already covered:** I1 and I17 (#2, #3), I2 (#1), I3 and I7 (#7), A3, A4 (#7, #18), I4, A2, A6 (#20), I5, A28, I6 (#20), I12, A25 (#45), I8, A26 (#14), I9, A27 (#26), I11, A24 (#12, #13), I15 (#2), I16 (#31), A1 (#17), A5 (#19), A7 (#19 and #39; Google sign-in checked on the first Android build, #40), X2 (retired with #21: no real SMS), X4 (#28), X5 (#27), A30 (#39, decided manual); CTO gaps 1–3: moderation (#45, D9), Vercel (section 3), reviewer account (#20).
  - **Left out on purpose:** I13, A8, A14, X7 (the list marks them done or fine); A13 adaptive icon colour is fixed inside #22 and checked in #39; A22 (EAS Update on Android) is not needed for launch, so R&O documents the version-bump rule after the first build and no row is planned.

## Change log

- 2026-11-05: v1.
- 2026-11-05: v2 (PAD-124, review of #313). Legal review re-dated (drafts 11-19, reviewer 11-25, 12-18 sign-off, with PT holidays); Play closed test moved to target 12-07, latest 12-10; Data safety form moved before the test; order fixes (labels after final text, iOS build row added, RC pass after blockers, listings final date); one owner per row with helpers, and interim owners for Legal, Growth and Designer rows; fallback given a beta date (01-11), a 12-18 trigger and 01-04 criteria; legal pages recognised as existing; rows for #314 and the Sentry inventory item added; PAD-56 and PAD-97 dropped; founder decision dates set (D2, D3 11-13; D4, D5, D6, D7 11-27). Rows renumbered.
- 2026-11-05: v3 (PAD-129). Closed test no longer contradicts D6: new row #11a, an interim corrected policy live by 12-03 (founder approves, CTO publishes), before the Data safety form and any tester invite; D6 now covers both the 12-07 closed test and any fallback beta, and the reviewer's narrow pass and the fallback if it fails are written out. PAD-65 settled: D1 and the founder decision in row #1 removed; row #1 is now the line going live on `/privacy` (PAD-64), and #2 depends on it; the full store labels are still to do. **Decision numbering: D1 left as a gap, D2–D7 not renumbered**, so earlier references still hold. Inventory (#9a, section 4) gains gender, date of birth, map location, Twilio and Nominatim. SMS: #19 says how testers sign in (Google plus an allow-list), new decision D8 (spend and sign-in, needed 11-20). 12-18 trigger now fires on the closed test only if the account requires it. #314 merged: wording updated; new rows 37–43 for deep links, Android device items, iPad and the cross-store gaps; section 6 maps every gap to a row or says why not.
- 2026-11-05: v3.1 (PAD-132). Section 5 table repaired (D1 note above the header); I7 mapped to row #7 and the covered list; restart limit corrected to 12-18; founder approval of the interim policy and the fallback choice moved to 12-02, after the reviewer's answer (four working days); row #1 now waits only on PAD-126 (PAD-127 done).
- 2026-11-06: v3.2 (PAD-241). SMS settled as `hide` (PAD-137): D8 and row #21 retired (numbering kept), #19 now email or Google with no allow-list, X2 updated; new row #44 hides phone sign-in (CTO confirms date, before #2). Legal is a separate company reached through `Legal:` tasks, not a hire: #9b, section 3 signal and section 4 rewritten. CTO gaps added: Vercel in section 3, reviewer account email and password (#20), moderation as row #45 and D9. CTO conditions: A30 decided manual (#39), #40 needs the founder's #17 log, #20 needs Firebase/FCM credentials and hosted seed by 11-27, #35 lists the founder for hotfixes, X3 check in #11 moves to the founder. **No dates moved**; #44 and #45 are new rows.
