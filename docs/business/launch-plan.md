# Launch plan

Goal: PadelJam, free, public on the App Store and Google Play in Portugal and Brazil in **January 2027**, in pt-PT, pt-BR and en, with the privacy policy and terms human-reviewed. Billing, paid tiers and the club dashboard are not in this plan.

_Owner: Head of Business. Draft v1, 2026-11-05. Follows `docs/company/roadmap.md`. Nothing here has been sent, bought or published; items marked **Founder** need the board (gates in `docs/agents/_rules.md`)._

## 1. The date

| | Date |
|---|---|
| Feature freeze (fixes only) | 2026-12-28 |
| **Last safe submission to both stores** | **Fri 2027-01-08** |
| **Target public date** | **Tue 2027-01-19** |
| Latest public date that is still "January" | Fri 2027-01-29 |
| Decision on the beta fallback | **Fri 2026-12-18** (final check 2027-01-04) |

How the last safe date is worked back (assumptions, none confirmed):

- **Apple review: 1–3 days typical, up to 7 for a first app.** A first submission often gets one rejection (privacy label, sign-in, metadata), so we plan for two rounds: 7 + 7 days from 01-08 gives 01-22, still inside January with a week spare. Not confirmed: the founder's Apple Developer account state and whether it is an organisation (needed for the listing name).
- **Google Play: review 1–7 days. But if the developer account is a personal one created after Nov 2023, production access requires a closed test with at least 12 testers opted in for 14 continuous days.** Not confirmed: account type. If it applies, the closed test must start by **2026-12-18** to open production by 01-08. This is the biggest schedule risk, so the account type is the first thing to check.
- **Human legal review of privacy policy and terms (PT and BR): assume 10 working days plus one revision round of 5.** Drafts must reach the reviewer by **2026-12-04** to finish by 12-18 and leave time for the stores' privacy labels. Not confirmed: who the reviewer is, their availability over Christmas, and their cost (a Founder gate-4 decision).
- Listings in three locales, screenshots and the privacy label are needed at submission, so they are due 12-21.

If any of these slips past its date, we do not move 01-19 quietly. See section 3.

## 2. Checklist

PT = Portugal, BR = Brazil, both = shared. Owners: HoB = Head of Business, CTO, PM, R&O = Release & Ops, Legal/Growth = when they join, Founder = board. Dates are targets.

### Open now

| # | Item | Market | Owner | Due |
|---|---|---|---|---|
| 1 | Level privacy-policy line and store labels settled ([PAD-65](/PAD/issues/PAD-65)); blocks any build that collects Level ([PAD-64](/PAD/issues/PAD-64)) | both | Founder | 11-13 |
| 2 | Migrations workflow manual run passes ([PAD-97](/PAD/issues/PAD-97)); releases team-on hold ([PAD-56](/PAD/issues/PAD-56)) | both | CTO / Founder | 11-09 |
| 3 | iOS device pass on a new build with the redesign ([PAD-32](/PAD/issues/PAD-32)); findings triaged in [PAD-31](/PAD/issues/PAD-31) | both | Founder / PM | 11-27 |
| 4 | Pre-0147 invitations ([PAD-99](/PAD/issues/PAD-99)) | both | CTO | 11-20 |
| 5 | Runner reliability ([PAD-98](/PAD/issues/PAD-98)); numbers on 11-11 ([PAD-51](/PAD/issues/PAD-51)) | both | CTO | 11-11 |
| 6 | Launch-ready checklist per area (PM) and store-readiness gap list (R&O): open inputs, due 11-12 | both | PM, R&O | 11-12 |

### Accounts and legal footing

| # | Item | Market | Owner | Due |
|---|---|---|---|---|
| 7 | Confirm Apple Developer and Google Play account type, status, and organisation verification (D-U-N-S if required) | both | Founder | 11-20 |
| 8 | Decide legal reviewer(s) for PT and BR and their cost | both | Founder (HoB drafts options) | 11-20 |
| 9 | Privacy policy and terms drafts, pt-PT, pt-BR, en. GDPR for PT; LGPD for BR (controller, legal basis, international transfers to Supabase region, data-subject rights, DPO/contact). Level and location data covered | PT, BR | Legal (until then: HoB lists the data inventory only) | draft 11-30, to reviewer 12-04 |
| 10 | Human legal review done, changes applied | PT, BR | Founder + reviewer | 12-18 |
| 11 | Publish policy and terms at stable URLs on the web app; link in app and in store listings | both | CTO builds, Founder approves (gate 5) | 12-21 |
| 12 | Store privacy labels: App Store nutrition label, Play Data safety form, from the data inventory | both | HoB drafts, Founder enters | 12-14 |
| 13 | Account deletion path (required by both stores) verified in app and on web | both | CTO | 12-11 |
| 14 | Support contact address and a support page | both | Founder | 12-14 |
| 15 | Age rating questionnaires (both stores), content rights, export compliance (encryption) answers | both | HoB drafts, Founder enters | 12-21 |

### Builds and store readiness

| # | Item | Market | Owner | Due |
|---|---|---|---|---|
| 16 | Android store build and signing, Play App Signing set up | both | CTO / R&O | 12-04 |
| 17 | iOS release candidate with redesign; iOS and Android device pass on the RC | both | CTO / PM | 12-23 |
| 18 | Launch blockers from the checklists fixed; unfinished areas hidden, not finished late | both | CTO | 12-24 |
| 19 | Feature freeze | both | CTO | 12-28 |
| 20 | TestFlight internal build; Play internal testing track | both | Founder (uploads, gate 1) | 12-04 |
| 21 | Play closed test (12 testers x 14 days) if the account requires it | both | Founder / HoB recruits list | start 12-18 |

### Listings and content

| # | Item | Market | Owner | Due |
|---|---|---|---|---|
| 22 | Listing copy (name, subtitle, description, keywords, what's new) in pt-PT, pt-BR, en; BR keywords researched separately from PT | PT, BR | HoB drafts, Growth when joined | draft 12-07 |
| 23 | Screenshots and preview per locale and device size | both | Designer / R&O | 12-14 |
| 24 | Help articles for core flows (communities, groups, events, live matches, chat) in three locales | both | PM / Growth | 01-05 |
| 25 | Brand and name check: trademark and store-name availability in PT and BR (INPI, EUIPO) | PT, BR | Legal / Founder | 12-04 |
| 26 | Support replies and review-reply templates (drafts only) | both | Growth | 01-05 |

### Submit and launch

| # | Item | Market | Owner | Due |
|---|---|---|---|---|
| 27 | Submission pack: builds, listings, labels, review notes, demo account for reviewers | both | HoB assembles, R&O checks | 01-04 |
| 28 | **Submit to both stores** (gate 3) | both | Founder | **01-08** |
| 29 | Answer reviewer questions and rejections within 24 h | both | HoB drafts, Founder sends | 01-08 → release |
| 30 | Release: manual release on both stores, same day, PT and BR | both | Founder | 01-19 |
| 31 | Launch-day monitoring and first-week hotfix path | both | CTO | 01-19 → 01-26 |
| 32 | Waitlist and announcement drafts (nothing sent by us) | PT, BR | Growth drafts, Founder sends | draft 01-05 |

## 3. Outside our control, and the fallback

| Dependency | Why we can't control it | Early signal | Decision date |
|---|---|---|---|
| Apple review | Timing and rejections are Apple's | Rejection or "in review" over 3 days | After submission |
| Google Play review, and the 12-tester / 14-day rule | Google's policy and timing | Account type unconfirmed (#7); closed test not started by 12-18 | **12-18** |
| Human legal review | Reviewer's availability over the holidays | Drafts not at the reviewer by 12-04; no review started by 12-11 | **12-18** |
| Founder-only steps (accounts, uploads, submission, label entry) | Single human, gates 1, 3, 4, 5 | Any founder task open more than 3 days past due | Weekly |
| Mac / runner capacity | Single laptop runner | [PAD-51](/PAD/issues/PAD-51) numbers on 11-11 | 11-11 |

**Fallback:** launch as a TestFlight and Play closed-testing beta instead of the public release, and say so. **The decision is made on 2026-12-18** (final check 2027-01-04): if on that day the legal review is not finished, or the Play production gate or an iOS device pass cannot complete before 01-08, the CEO takes the fallback to the founder the same day. A public date is only moved by an explicit founder decision recorded on a task. The plan is never edited silently: any date change gets a dated line in the change log below.

## 4. What Legal and Growth will need (written down, not done)

Both are planned for about 11-12 and are not confirmed.

**Legal**
- The data inventory (what we collect, where it lives, who sees it): profile, Level, location, chat, push tokens, analytics if any. HoB can assemble this from the code once asked.
- Which reviewer, which jurisdiction (PT and BR counsel), cost and turnaround. Founder decision.
- Target draft dates: 11-30 draft, 12-04 to reviewer, 12-18 reviewed.
- Open question for the reviewer: LGPD representation and a DPO contact, and transfers to the Supabase region.
- Store labels depend on the final policy text (#12).

**Growth**
- Locale rules: pt-PT and pt-BR copy are separate; keywords researched per market.
- Inputs: final app name, one-line positioning, screenshots, and a decision on whether a waitlist exists and where it is.
- Drafts for listings (#22), help articles (#24), review-reply and support templates (#26), announcement (#32). All sending stays with the founder.
- A launch-week measurement list. Needs the tracking plan to exist first.

## 5. Founder decisions

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| D1 | Level privacy line and store labels ([PAD-65](/PAD/issues/PAD-65)) | Disclose Level as profile data, not shared with third parties; state it in the policy before any build collecting it ships | 11-13 |
| D2 | Confirm Apple and Google account type and status | Check both this week; if Google is a personal account, plan the 14-day closed test now | 11-20 |
| D3 | Legal reviewer(s) and budget (gate 4) | One reviewer who covers both PT and BR, or two if none does; book now, because the holiday window is tight | 11-20 |
| D4 | Public date: 2027-01-19 | Approve it as target, with 01-29 the latest "January" date | 11-27 |
| D5 | Who is the Play closed-test cohort (12 testers) | Padel clubs and players the founder already knows, in PT and BR | 12-04 |
| D6 | Fallback if gates slip: beta instead of public | Pre-approve it, so 12-18 is an announcement rather than a debate | 12-18 |
| D7 | Support address and Terms contact | A role address on the company domain | 12-14 |

## 6. Open inputs

- PM: launch-ready checklist per area, due 11-12 (not yet linked; add when it exists).
- Release & Ops: store-readiness gap list, Android especially, due 11-12 (not yet linked).
- Both will change items 16–24; update this plan when they land.

## Change log

- 2026-11-05: v1.
