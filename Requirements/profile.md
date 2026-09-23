# Profile & Settings

*Padel Jam — Version 1.3 • May 2026 • Wireframe-derived requirements*

> **Status, 2026-09-23 — the audit has shipped in full.** The external UX audit "Profile & Settings"
> (UX-PROF-01..06, UX-SET-01..13) supersedes this document wherever the two conflict. See
> `docs/audit/2026-09-22-ux-profile-settings.md` for the items and the decisions taken, and
> `…-plan.md` for how they shipped — 21 pull requests, merged through #185, plus migrations 0102
> to 0105. Sections amended by that audit carry an inline **[Amended 2026-09-22]** note, and those
> amended by decisions taken during the build an **[Amended 2026-09-23]** one; each gives the change
> and the reason, and the original intent is stated alongside rather than deleted. Where the document
> specifies something that was never built, the section says **[Not implemented]** rather than being
> quietly rewritten to match the code. Section 07 (Subscription) is unchanged in substance — it
> remains the source of truth other documents cite for plan limits — and carries only a note on what
> the MVP ships in the meantime.

This document defines the player Profile — the public identity a user presents, the way users follow, block, and report one another — together with Settings, where a user configures their account, preferences, notifications, subscriptions (Jammer+ and Community Plans), support, and more. It also defines the canonical profiles table, the central user record referenced by every other module, and is the source of truth for player and community subscription rules referenced across the app.

**Confirmed design decisions**

- The profile is a player’s public identity — stats, preferences, groups, recent results — viewable by other users. All accounts are public in the MVP (no private-account toggle).

- Following another user is instant — no approval, no request. A user can block and report other users. A blocked user’s profile becomes inaccessible (a no-access page); the blocker can unblock to restore access.

- Player tiers are Free (Jammer) and Premium (Jammer+). Jammer+ is the only player tier with a 7-day trial.

- Community Plans are a separate subscription owned per community by its creator. Three MVP tiers: Starter (free), Basic (€9.99/mo · €99/yr) and Community Pro (€24.99/mo · €249/yr). Community plans have no trial.

- Paid Community plans (Basic, Community Pro) bundle Jammer+ for the community owner at no extra charge. Cancelling a paid Community plan reverts the bundled Jammer+ to Free at the end of the billing period unless the owner subscribes to Jammer+ separately first.

- Dominant hand and preferred court side use Left / Right only (no Whatever / Any). Preferred time uses Any / Morning / Afternoon / Night.

- Notifications has three independent toggles: Push, WhatsApp, Email. WhatsApp and Email default off; Push defaults on.

- Change password requires the current password, a new password of at least 8 characters, and the new password repeated.

- Changing the account email or mobile number requires OTP verification on the new identifier before the change is committed.

- Contact support is an in-app bottom sheet (title + description + send) that creates a support_ticket; the visible response SLA is five days. Help center, Terms of use, Privacy Policy, Rate the app, and Share the app remain external destinations.

- profiles is the central user table, defined in this document. The profile row is created during onboarding (Auth doc); log-out and the account-deletion teardown belong to the Auth doc.

## Overview

**Two flows**

- Profile — the player’s public identity: viewing one’s own profile, viewing another player’s, and the social actions between users (follow, block, report).

- Settings — the account configuration hub: account settings (including account deletion), game preferences, notifications, privacy, subscriptions (Jammer+ and Community Plans), support, and legal.

**The profiles table**

Every other Padel Jam module references profiles as a foreign key. This document is where profiles is formally defined. The row is created during onboarding (Auth & Onboarding doc); its fields and editing live here.

**Subscription source of truth**

Section 07 of this document is the source of truth for player and community plan rules and limits. Every other doc that gates a feature by plan (member limits, ad-free rendering, broadcasts, history retention, etc.) references those rules from here.

**Out of scope**

- Authentication, sessions, sign-in / sign-up, onboarding, and the actual log-out / account-deletion teardown — the Auth & Onboarding doc.

- Payment processing for subscriptions — this doc specifies the screens and states; the billing provider (e.g. Stripe) integration belongs to a separate Billing module.

- The Create Community wizard and community-side surfaces — the Communities doc.

## Data model

Six tables touched. profiles is defined here; follows was introduced (minimally) in the Join & Manage Event doc and is referenced. Full SQL is in section 10.

| **profiles** | The central user record — identity, contact, preferences. Referenced by every module. |
|----|----|
| **follows** | The follow graph (follower → followee). Defined in the Join & Manage doc; referenced here. |
| **blocks** | A user blocking another user. |
| **reports** | A user reporting another user (reason + description). |
| **user_settings** | Per-user app settings — notifications toggles (push, whatsapp, email) and language. |
| **subscriptions** | A user’s player-level (Jammer+) subscription state — free / trialing / active / cancelled. |
| **community_subscriptions** | A community’s organizer-tier subscription — starter / basic / community_pro. |
| **support_tickets** | A user-submitted Contact support message — title, description, status. |

## Profile

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.1 Layout</strong></th>
</tr>
<tr>
<th><strong>Header</strong></th>
<th>Avatar, name, and Following / Followers counts (each opens the respective list).</th>
</tr>
<tr>
<th><strong>Stats</strong></th>
<th>Played matches and Best position — computed from the player’s event history.</th>
</tr>
<tr>
<th><strong>Preferences</strong></th>
<th>Dominant hand, court side, preferred time.</th>
</tr>
<tr>
<th><strong>Groups</strong></th>
<th>The groups the player belongs to. <strong>[Amended 2026-09-22]</strong> On your OWN profile, all of them. On another player’s, only groups in communities you both belong to, excluding private groups and excluding any admin/managing flag — that flag describes a relationship the viewer has no business reading, and the underlying <code>my_groups</code> function is security definer, so parameterising it by user is a privacy widening rather than a refactor.</th>
</tr>
<tr>
<th><strong>Last results</strong></th>
<th>A preview of the player’s most recent match results.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.2 Own profile vs viewing another player</strong></th>
</tr>
<tr>
<th><strong>Own profile</strong></th>
<th>Reached from the Profile bottom-nav tab. Carries a settings icon (→ Settings). No follow / message actions.</th>
</tr>
<tr>
<th><strong>Another player — not followed</strong></th>
<th>Shows a Follow button under the header. <strong>[Amended 2026-09-22]</strong> No Message button: messaging moved into the kebab sheet and is offered only once you follow the player. Originally both buttons sat under the header.</th>
</tr>
<tr>
<th><strong>Another player — already followed</strong></th>
<th>The Follow button is replaced by a followed state. <strong>[Amended 2026-09-22]</strong> Message is in the kebab sheet, not beside the button.</th>
</tr>
<tr>
<th><strong>Message</strong></th>
<th>Opens a direct chat with that player (Chat — Home doc). <strong>[Amended 2026-09-22]</strong> Reachable ONLY from the kebab sheet, and only when you follow the player — the single entry point to messaging from a profile. The build settles this: the New Chat screen lists only people you follow, so a Message button on a stranger’s profile would open a surface that cannot list them.</th>
</tr>
<tr>
<th><strong>Kebab menu</strong></th>
<th>A “…” menu on another player’s profile, opening as a bottom sheet: Share, Follow / Unfollow, <strong>Message (only when followed)</strong>, Block, Report. <strong>[Amended 2026-09-22]</strong> Message added to the sheet.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Follow system

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4 Following &amp; followers</strong></th>
</tr>
<tr>
<th><strong>Following</strong></th>
<th>Instant — tapping Follow follows the player immediately, with no approval or request.</th>
</tr>
<tr>
<th><strong>Unfollowing</strong></th>
<th>Done from the followed state or the kebab menu.</th>
</tr>
<tr>
<th><strong>Following list</strong></th>
<th>A searchable list of the players the user follows; each row has a follow control and a kebab menu.</th>
</tr>
<tr>
<th><strong>Followers list</strong></th>
<th>A searchable list of the players who follow the user.</th>
</tr>
<tr>
<th><strong>Where the graph is used</strong></th>
<th>The follow graph powers: the New Chat default list (Home doc), “Players you might know” and search ranking (Discovery doc), and the social notifications (Home doc).</th>
</tr>
<tr>
<th><strong>DB</strong></th>
<th>The follows table (follower_id → followee_id), defined in the Join &amp; Manage Event doc.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Block & Report

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.1 Block</strong></th>
</tr>
<tr>
<th><strong>Action</strong></th>
<th>From a player’s kebab menu → Block. A “Block User” confirmation modal is shown (Confirm / Cancel).</th>
</tr>
<tr>
<th><strong>Effect</strong></th>
<th>Once blocked, that player’s profile is inaccessible to the blocker: opening it shows a no-access page — “Sorry, you don’t have access to this page! Unblock the user and see the details.”</th>
</tr>
<tr>
<th><strong>Mutual</strong></th>
<th>A block hides each user’s profile from the other (a block in either direction blocks visibility both ways).</th>
</tr>
<tr>
<th><strong>Unblock</strong></th>
<th>The no-access page has an Unblock action that restores access. <strong>[Amended 2026-09-22, addition]</strong> The no-access page stays as specified. A second state is added: opening the profile of someone YOU blocked collapses it to photo, name and Unblock, with all other content removed. That view reads from a <code>list_my_blocks</code> function rather than a widened read policy — row-level security hides the profile in both directions, so the blocker cannot read the row either, and loosening it would widen every membership and roster embed that resolves under it.</th>
</tr>
<tr>
<th><strong>DB</strong></th>
<th>A blocks row (blocker_id, blocked_id); unblocking deletes it.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.2 Report</strong></th>
</tr>
<tr>
<th><strong>Action</strong></th>
<th>From a player’s kebab menu → Report.</th>
</tr>
<tr>
<th><strong>Form</strong></th>
<th>A Report modal: Reason (dropdown) and Description (free text). Confirm / Cancel.</th>
</tr>
<tr>
<th><strong>Effect</strong></th>
<th>Creates a reports row for moderation review. Reporting does not block the user.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Settings

Reached from the settings icon on the user’s own profile. The Settings hub groups entries into sections; each opens its own screen.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.1 Settings hub</strong></th>
</tr>
<tr>
<th><strong>Account</strong></th>
<th>Account settings, Game preferences, Privacy.</th>
</tr>
<tr>
<th><strong>Notifications</strong></th>
<th>Notifications.</th>
</tr>
<tr>
<th><strong>Subscription</strong></th>
<th>Jammer+ (opens the Jammer+ subscription screen, 7.2). Community Plans (opens the list of communities the user owns or, when there is exactly one, opens its Community subscription screen directly, 7.3).</th>
</tr>
<tr>
<th><strong>Support</strong></th>
<th>Support and feedback, App preferences.</th>
</tr>
<tr>
<th><strong>Legal</strong></th>
<th>Legal.</th>
</tr>
<tr>
<th><strong>(bottom)</strong></th>
<th>A red Log out action. (Session teardown — Auth doc.)</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.2 Settings screens</strong></th>
</tr>
<tr>
<th><strong>Account settings</strong></th>
<th>Avatar, name, description / bio, email, mobile number, date of birth, location, gender. Each field has its own inline edit; Save commits the form. At the bottom of the screen, a destructive “Delete account” entry opens the Delete account screen (section 08).</th>
</tr>
<tr>
<th><strong>Account settings — changing email or mobile</strong></th>
<th>Editing the email or mobile field and tapping Save triggers an OTP sent to the NEW identifier. The change is held in a pending state and committed only after the OTP is verified (6-digit code, 10-minute expiry, 30-second resend cooldown — mirroring the Auth doc rules). Cancelling the OTP discards the pending change. Other fields (name, description, date of birth, location, gender) commit immediately on Save.</th>
</tr>
<tr>
<th><strong>Game preferences</strong></th>
<th>Dominant hand (Right / Left) and preferred side of the court (Right / Left). Preferred time (Any / Morning / Afternoon / Night).</th>
</tr>
<tr>
<th><strong>Notifications</strong></th>
<th>Three independent toggles. Push notifications — receive notifications on the device, even when the app is closed (default on). WhatsApp messages — receive event-related messages from organizers and the platform via WhatsApp (default off; enabling it is the user’s explicit consent to receive WhatsApp messages). Email — receive event-related communications from organizers and the platform via email (default off; same explicit-consent semantics). The WhatsApp and Email channels are what the Event-broadcast feature (Events doc) writes to.</th>
</tr>
<tr>
<th><strong>Privacy</strong></th>
<th>Two entries: Change password (opens the Change password screen) and Blocked Users (opens a searchable list of blocked users with an Unblock action per row).</th>
</tr>
<tr>
<th><strong>Change password</strong></th>
<th>Current password (with show / hide and a “Forgot password?” link that launches the Auth doc password-recovery flow), New password, and Repeat new password. Policy: minimum 8 characters; the New password field shows “8+ characters” as a soft hint and rejects shorter input. Save commits.</th>
</tr>
<tr>
<th><strong>App preferences</strong></th>
<th>Two sections on a single screen. Language selection (a dropdown selector preset to the user’s current language; English is the only locale shipped in the MVP, the structure is ready for more) and App Icon (a 2-row × 3-column grid of the six icon variants the app ships with; single-select; the currently active variant is highlighted). <strong>[Amended 2026-09-22]</strong> There is no Save button: both settings take effect on selection. Language persists to <code>profiles.locale</code>, not <code>user_settings</code> — that table has no language column and never did. The language selector is a bottom sheet, not a dropdown, and the shipped locales are pt-PT, pt-BR and en, not English alone. Changing the App Icon writes the chosen identifier and triggers a platform call to swap the active home-screen icon — setAlternateIconName on iOS, an activity-alias toggle on Android. Theme is not in the MVP.</th>
</tr>
<tr>
<th><strong>Legal</strong></th>
<th>Terms of use and Privacy Policy — each opens an external web destination.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.3 Support and feedback</strong></th>
</tr>
<tr>
<th><strong>Help center</strong></th>
<th>Opens an external FAQ / help web page.</th>
</tr>
<tr>
<th><strong>Contact support</strong></th>
<th>Opens the Contact support screen at <code>/profile/support/contact</code> (see 6.4). <strong>[Amended 2026-09-23]</strong> A route, not a bottom sheet. The form already existed as a full screen with field validation and an unsaved-changes guard; rebuilding it inside a sheet would have been churn against working code for no change the user can see. Originally an in-app bottom sheet.</th>
</tr>
<tr>
<th><strong>Rate the app</strong></th>
<th>Opens the app store listing. <strong>[Amended 2026-09-23]</strong> The row is <strong>hidden until there is somewhere to send the user</strong>: PadelJam is not on the store, so <code>STORE_URL</code> in <code>apps/mobile/lib/externalUrls.ts</code> is an empty string and the row renders only once it is filled in — a row that opens nothing is worse than a row that is not there. Filling that constant is the whole of switching the feature on. It opens the store URL rather than the native in-app rating prompt, which would need <code>expo-store-review</code> and therefore a dev-client rebuild for every developer.</th>
</tr>
<tr>
<th><strong>Share the app</strong></th>
<th>Opens the system share sheet with an invite link.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.4 Contact support screen</strong> — <em>[Amended 2026-09-23, was “sheet”]</em></th>
</tr>
<tr>
<th><strong>Entry point</strong></th>
<th>Tapping Contact support on 6.3.</th>
</tr>
<tr>
<th><strong>Layout</strong></th>
<th><strong>[Amended 2026-09-23]</strong> A full screen at <code>/profile/support/contact</code> with an edit-style top bar: the title “Contact support”, a close icon, and the same unsaved-changes guard every other edit screen uses. The “we’ll get back to you within 5 days” promise is <em>not</em> on this screen — it is the subtitle of the Contact support row on 6.3, where it is read before the user starts typing rather than after, and it is repeated in the confirmation. Originally a bottom sheet sliding up with that line beneath the title.</th>
</tr>
<tr>
<th><strong>Fields</strong></th>
<th>Title (single-line text input, required). Description (multi-line text area, required). <strong>[Not implemented, 2026-09-23]</strong> The 80- and 2000-character caps are specified here and enforced nowhere: neither field passes <code>maxLength</code>, and <code>support_tickets.title</code> and <code>.description</code> are unbounded <code>text</code> with no check constraint (<code>0060_support_tickets.sql</code>). Recorded rather than quietly dropped — the caps remain the intent.</th>
</tr>
<tr>
<th><strong>Send</strong></th>
<th>A primary Send button at the bottom. Tapping Send inserts a support_tickets row (user_id, title, description, status default open), shows a success banner (“Thanks — we’ll get back to you within 5 days.”) and returns to 6.3. <strong>[Amended 2026-09-23]</strong> On mobile the button is <strong>never disabled</strong>: tapping it with a field empty turns that field red and shows the banner, per UX-GLOB-06 — a button that is dimmed for a reason it will not state is the pattern that rule exists to remove. Web still disables its submit until both fields are non-empty; that divergence is known and unresolved. Originally: disabled until both fields were non-empty on both platforms.</th>
</tr>
<tr>
<th><strong>Error handling</strong></th>
<th>A failed insert keeps the screen open and the fields filled, so Send is one tap away. <strong>[Amended 2026-09-23]</strong> Mobile shows it in the banner rather than as an inline line under Send, which is where UX-GLOB-06 puts every failed submit; web shows it inline under the fields with <code>role=“alert”</code>. The wording is the specified “Couldn’t send — try again.”</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Subscription

Padel Jam has two independent subscription axes: a player-level subscription (Jammer+) and a community-level subscription (Community Plans). The Settings hub exposes both. Section 7.5 and 7.6 are the source of truth for the limits each tier confers; every other doc that gates a feature by plan references those rules from here.

> **MVP note, 2026-09-22 — this section is unchanged and remains the target.** The audit's two
> subscription screens (UX-SET-09 Jammer+, UX-SET-10 Community Plans) are **deferred until billing
> exists** (`Structure Files/09-payments.md`: Stripe + Stripe Connect on web, RevenueCat on mobile —
> none of it built). Plans today are *granted on request* under global rule UX-GLOB-10: the
> `subscriptions` / `community_subscriptions` rows carry `provider = 'manual'`, there is no billing
> cadence, no `cancel_at_period_end`, and `current_period_end` is never populated — so the renewal
> prices and next-billing dates in 7.2 and 7.3 cannot be rendered honestly yet.
>
> What ships in the meantime: the Settings hub carries the Subscription group, with Jammer+ opening
> the existing granted-on-request paywall and Community Plans opening Manage Community's existing
> Plan section, shown only when the user owns at least one community. The middle community tier keeps
> the plan_id `basic` used throughout 7.6 and the seed (the audit's "Organizer" is read as shorthand),
> and making it settable deliberately activates the dormant `jammer_plus_included` bundling this
> section already specifies. Nothing in 7.5 or 7.6 changes; the documents that cite them are unaffected.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.1 Settings entries</strong></th>
</tr>
<tr>
<th><strong>Jammer+</strong></th>
<th>A row in the Subscription section of the Settings hub. The right side of the row shows the current player tier (“Free”, “Jammer+ — trial”, “Jammer+”, or “Jammer+ via {COMMUNITY}” where COMMUNITY is the name of the paid community that bundles it). Tap opens 7.2.</th>
</tr>
<tr>
<th><strong>Community Plans</strong></th>
<th>A second row in the same Subscription section. The right side shows “{N} communit(y / ies)” where N is the count of communities owned by the user. Tap behaviour: 0 owned communities → an empty state screen with a Create community CTA (handed off to the Communities doc); exactly 1 owned community → opens that community’s subscription screen directly (7.3); 2+ owned communities → opens a list of owned communities with current tier label per row, tapping a row opens 7.3 for that community.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.2 Jammer+ subscription screen</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Jammer+” with a back arrow.</th>
</tr>
<tr>
<th><strong>State A — Free</strong></th>
<th>Card titled “Free” with the price “€0.00/month”. Bulleted benefits: Basic match stats; Friend system &amp; profile; Last 6 months of match history. Primary CTA at the bottom of the card: “Upgrade to Jammer+” which opens the player upgrade picker (7.4 Player picker).</th>
</tr>
<tr>
<th><strong>State B — Jammer+ (direct subscription)</strong></th>
<th>Card titled “Jammer+” with the renewal price (“€4.99/month” or “€39/year” depending on cadence) and “Next billing: {DATE}”. Bulleted benefits: Unlimited match history; Ad-free experience. At the bottom of the card, a destructive “Cancel Subscription” link. Cancelling opens a confirmation modal; on confirm the subscription remains active until current_period_end and then reverts to Free.</th>
</tr>
<tr>
<th><strong>State C — Jammer+ via Community</strong></th>
<th>Card titled “Jammer+” with a subtitle “Linked to {COMMUNITY} subscription”. Same bulleted benefits as State B. The primary CTA is “Go to Community Subscription” which routes to 7.3 for the bundling community. The user cannot cancel Jammer+ on this screen — the bundle is managed from the Community subscription screen. A short helper line under the CTA explains: “Cancelling the community plan ends the bundled Jammer+ at the end of the billing period.”</th>
</tr>
<tr>
<th><strong>State C — trial</strong></th>
<th>When the player is on a 7-day Jammer+ trial (status = trialing), the State B card adds a banner above the benefit list: “You’re on a 7-day free trial — {N} days left.” It also shows the post-trial conversion price and date.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.3 Community subscription screen</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Community” with a back arrow.</th>
</tr>
<tr>
<th><strong>State A — Starter (free)</strong></th>
<th>Card titled “Starter” with price “€0.00/month”. Bulleted features for Starter (see 7.6). Primary CTA: “Upgrade”, which opens the community upgrade picker (7.4 Community picker).</th>
</tr>
<tr>
<th><strong>State B — Basic (paid)</strong></th>
<th>Card titled “Basic” with the renewal price (€9.99/month or €99/year) and “Next billing: {DATE}”. Bulleted features for Basic. Primary CTA: “Upgrade” (opens the Community picker preselected on Community Pro). Destructive link at the bottom: “Cancel Subscription”.</th>
</tr>
<tr>
<th><strong>State C — Community Pro (paid)</strong></th>
<th>Card titled “Community Pro” with the renewal price (€24.99/month or €249/year) and “Next billing: {DATE}”. Bulleted features for Community Pro. No Upgrade CTA in the MVP (Community Pro is the top MVP tier). Destructive link at the bottom: “Cancel Subscription”.</th>
</tr>
<tr>
<th><strong>Cancel confirmation</strong></th>
<th>Cancelling any paid tier opens a confirmation modal that calls out the bundling effect: “Cancelling your community plan will also end the bundled Jammer+ for you at the end of the billing period.” On confirm the community_subscriptions row is set to cancel_at_period_end = true; the tier remains active until current_period_end and then reverts to Starter.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.4 Upgrade picker</strong></th>
</tr>
<tr>
<th><strong>Shared component</strong></th>
<th>The same picker component is used for player and community upgrades — only the source data, tier rows, and write target differ. The picker is reached from the “Upgrade” CTAs on 7.2 (player) and 7.3 (community).</th>
</tr>
<tr>
<th><strong>Player picker</strong></th>
<th>A modal screen titled “Play premium Padel experiences with Jammer+”. Bulleted Jammer+ benefits at the top. Two plan cards below: Annually (€39.00/year, labelled “Most popular”) and Monthly (€4.99/month). Secondary link: “Not sure yet? Continue with free” (closes the picker, no charge). Primary CTA: “Continue” (starts the paid subscription on the selected cadence via the billing provider). Trial CTA: “Try 7-day trial” (starts a 7-day trial on the selected cadence; no charge for 7 days, then auto-renews unless cancelled).</th>
</tr>
<tr>
<th><strong>Community picker</strong></th>
<th>A modal screen titled “Improve your community experience”. A tab row at the top with the three tiers (Starter / Basic / Community Pro). Each tab swaps the description and feature list. The user’s current tier is indicated on its tab. Plan cards under each tab: Starter — one card at €0.00/month with a “Continue” CTA (provisions or stays on Starter); Basic and Community Pro — two cards each (Annually / Monthly) with a single “Continue” CTA that starts the subscription on the selected cadence. There is no trial on Community plans.</th>
</tr>
<tr>
<th><strong>Mid-cycle changes</strong></th>
<th>Upgrades (e.g. Basic → Community Pro) take effect immediately and are prorated by the billing provider. Downgrades (e.g. Community Pro → Basic) take effect at the end of the current billing period; the user keeps the higher-tier limits until then.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.5 Player plan rules (source of truth)</strong></th>
</tr>
<tr>
<th><strong>Free — Jammer (default tier)</strong></th>
<th>Price: €0. Trial: none. Communities joined: unlimited. Events joined: unlimited. Match history retention: last 6 months. Match stats scope: Basic (W/L, partners, courts). Friend system &amp; profile: full access. Ads: standard ad placements rendered.</th>
</tr>
<tr>
<th><strong>Jammer+ (Premium)</strong></th>
<th>Price: €4.99/month or €39/year (€3.25/month equivalent, ~35% annual discount). Trial: 7 days, one trial per user lifetime. Match history retention: unlimited. Match stats scope: Basic (same as Free in the MVP). Ads: none (ad-free experience).</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.6 Community plan rules (source of truth)</strong></th>
</tr>
<tr>
<th><strong>Starter (default tier)</strong></th>
<th>Price: €0, forever. Trial: not applicable. Members cap: 10. Groups cap: 1. Recurring events cap: 1. Event management: basic scheduling, RSVPs, attendance. Community feed: posts and comments. Discoverability: listed on PadelJam search (no priority). WhatsApp &amp; Email broadcasts: enabled, default template only (no customisation). Co-organizers: 0 (owner-only). Jammer+ bundle: not included.</th>
</tr>
<tr>
<th><strong>Basic</strong></th>
<th>Price: €9.99/month or €99/year (€8.25/month equivalent, ~17% annual discount). Trial: none. Everything in Starter, plus: Members cap: 50. Groups cap: 3. Recurring events cap: 5. Co-organizers: 1 additional admin slot. WhatsApp &amp; Email broadcasts: custom message (the owner’s own copy, not just the default template). Jammer+ bundle: included for the community owner at no extra charge.</th>
</tr>
<tr>
<th><strong>Community Pro</strong></th>
<th>Price: €24.99/month or €249/year (€20.75/month equivalent, ~17% annual discount). Trial: none. Everything in Basic, plus: Members cap: 250. Groups cap: unlimited. Recurring events cap: unlimited. Co-organizers: 3 additional admin slots. Support: priority (Pro tickets are replied to first). Jammer+ bundle: included for the community owner at no extra charge.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7.7 Bundling, billing, and cancellation</strong></th>
</tr>
<tr>
<th><strong>Bundling — who gets Jammer+</strong></th>
<th>When a community owner subscribes to Basic or Community Pro, that owner’s player-level subscription is upgraded to Jammer+ with source = community_bundle for as long as the paid community plan is active. Co-organizers and regular members are NOT included — the bundle is owner-only.</th>
</tr>
<tr>
<th><strong>Bundling — visibility</strong></th>
<th>The Jammer+ screen (7.2) renders State C when subscriptions.source = community_bundle. Cancelling Jammer+ is disabled in that state; the user must cancel from the Community subscription screen instead.</th>
</tr>
<tr>
<th><strong>Cancellation — end of period</strong></th>
<th>All cancellations (Jammer+ direct, or Community paid tiers) take effect at the end of the current billing period. Until then the user keeps the tier’s benefits. The subscriptions / community_subscriptions row has cancel_at_period_end = true and a current_period_end set; a scheduled job (or the billing webhook) flips status to free / starter when that date passes.</th>
</tr>
<tr>
<th><strong>Cancellation — bundled Jammer+</strong></th>
<th>When a paid Community plan is cancelled and reaches current_period_end, the bundled Jammer+ on that owner reverts to Free at the same moment, UNLESS the owner has separately subscribed to Jammer+ during the period (direct subscription supersedes the bundle going forward).</th>
</tr>
<tr>
<th><strong>Trial — Jammer+ only</strong></th>
<th>The 7-day trial is exclusive to Jammer+. Community plans have no trial. A user gets at most one Jammer+ trial per lifetime; the eligibility check is server-side.</th>
</tr>
<tr>
<th><strong>Plan limits enforcement</strong></th>
<th>The rules in 7.5 (player tier benefits) and 7.6 (community tier limits) are enforced server-side. Match history queries return only the last 6 months for Free players; ad placements render only for Free players. On the community side, adding a member / group / event beyond a community cap, or inviting a co-organizer beyond the slot count, is rejected at the API layer with a structured error the client surfaces as a “Upgrade to {tier} to {action}” prompt.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Delete account

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>8 Deleting an account</strong></th>
</tr>
<tr>
<th><strong>Entry</strong></th>
<th>A destructive “Delete account” entry at the bottom of the Account settings screen (6.2). Tapping it opens the Delete account screen.</th>
</tr>
<tr>
<th><strong>Warning</strong></th>
<th>A prominent warning at the top of the screen: deleting the account permanently erases all data and cannot be undone.</th>
</tr>
<tr>
<th><strong>What is erased</strong></th>
<th>The screen lists each data category: profile and personal information; match and activity history; messages and conversations; payment information; other data.</th>
</tr>
<tr>
<th><strong>Action</strong></th>
<th>A red, full-width destructive CTA at the bottom of the screen (“Delete account”). Tapping it opens a final confirmation modal (“Are you sure? This cannot be undone.”, Cancel / Delete). The actual account / session teardown is specified in the Auth &amp; Onboarding doc; this doc specifies the screen and its content.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed PR (Profile).

| **ID** | **Requirement** | **Priority** | **Notes** |
|----|----|----|----|
| PR-01 | Every user has a public profile viewable by other users. | **Must** | All accounts public in MVP. |
| PR-02 | The profile shows stats (Played matches, Best position) and preferences (dominant hand, court side, preferred time). | **Must** |  |
| PR-03 | The profile shows the user’s groups and a last-results preview. | **Must** |  |
| PR-04 | Viewing another player’s profile shows a Follow action and a kebab sheet (Share, Follow / Unfollow, Message when followed, Block, Report). | **Must** | **Amended 2026-09-22** — Message moved from a header button into the sheet. |
| PR-05 | Following another user is instant — no approval or request. | **Must** |  |
| PR-06 | Following and Followers are searchable lists. | **Must** |  |
| PR-07 | A user can block another user with a confirmation modal; a blocked user’s profile becomes inaccessible to the blocker. | **Must** | Block is mutual for visibility. |
| PR-08 | A user can report another user with a reason and a description. | **Must** |  |
| PR-09 | Message on a profile opens a direct chat with that player, from the kebab sheet and only when you follow them. | Should | **Amended 2026-09-22** — gated on following, to match New Chat, which lists only people you follow. |
| PR-10 | Settings groups Account, Notifications, Subscription, Support, and Legal, with a destructive Log out action at the bottom. | **Must** |  |
| PR-11 | Account settings edits avatar, name, description / bio, email, mobile, date of birth, location, gender; the destructive Delete account entry sits at the bottom. | **Must** |  |
| PR-12 | Changing the email or mobile in Account settings sends an OTP to the new identifier; the change is committed only after OTP verification. | **Must** |  |
| PR-13 | Game preferences edits dominant hand (Left / Right), court side (Left / Right), and preferred time (Any / Morning / Afternoon / Night). | **Must** |  |
| PR-14 | Notifications has three independent toggles — Push (default on), WhatsApp (default off), Email (default off). | **Must** |  |
| PR-10 | Privacy contains two entries: Change password and Blocked Users. | **Must** |  |
| PR-11 | Change password requires current password, a new password of at least 8 characters, and the new password repeated. | **Must** |  |
| PR-12 | A Forgot password link inside Change password launches the Auth doc password-recovery flow. | **Must** |  |
| PR-13 | App preferences contains a Language selector only. | **Must** | Theme not in MVP. |
| PR-14 | The Subscription section in the Settings hub has two entries: Jammer+ and Community Plans. | **Must** |  |
| PR-10 | The Jammer+ screen renders three states — Free (with Upgrade), Direct subscription (with Cancel), Bundled via Community (with Go to Community Subscription). | **Must** |  |
| PR-11 | The Community subscription screen renders three states (Starter, Basic, Community Pro) with Upgrade and Cancel CTAs as applicable; Pro has no Upgrade in the MVP. | **Must** |  |
| PR-12 | Paid Community plans (Basic, Community Pro) automatically include Jammer+ for the community owner at no extra charge; the bundle is owner-only. | **Must** |  |
| PR-13 | Cancelling a paid Community plan reverts the bundled Jammer+ to Free at the end of the billing period unless the owner separately subscribed to Jammer+ during the period. | **Must** |  |
| PR-14 | Only Jammer+ has a 7-day trial, limited to one per user lifetime; Community plans have no trial. | **Must** |  |
| PR-10 | Plan rules from 7.5 and 7.6 are enforced server-side: match history retention and ad rendering on the player side, and member / group / event / co-organizer caps on the community side. | **Must** |  |
| PR-11 | Support and feedback lists Help center, Contact support, Rate the app, Share the app. | **Must** |  |
| PR-12 | Contact support opens an in-app bottom sheet with Title + Description + Send; subtitle reads “We’ll get back to you within 5 days.” Send inserts a support_tickets row. | **Must** |  |
| PR-13 | Help center, Terms of use, Privacy Policy, Rate the app, and Share the app open external destinations. | **Must** |  |
| PR-14 | Delete account is reached from Account settings; the screen shows a warning, the erased-data list, and a destructive Delete CTA with a final confirmation modal. | **Must** | Teardown — Auth doc. |

## Database schema

> **[Note, 2026-09-22]** The authoritative schema is `infra/supabase/migrations/` and the generated
> `packages/db/src/database.types.ts`, not this section. `profiles` and `user_settings` below have
> been corrected to match what shipped. The `subscriptions` and `community_subscriptions` blocks are
> left as written because they describe the billing-era target of section 07; the rows that exist
> today are shaped differently (no `source`, no `billing_cycle`, no `cancel_at_period_end`; instead a
> `plan_id`, a `provider` enum of stripe/revenuecat/manual, and a `provider_ref`). See the MVP note
> in section 07.

**profiles (the central user table)**

> **[Corrected 2026-09-22]** The block below now matches the shipped database. The original named
> `name`, `avatar_path`, `preferred_court_side`, `location`, `mobile` and separate `latitude` /
> `longitude` columns; none of those exist. Anyone writing code against the original names got
> column-not-found at runtime.

| **Column** | **Type** | **Nullable** | **Notes** |
|----|----|----|----|
| id | UUID | No | PK; references auth.users(id) ON DELETE CASCADE |
| full_name | TEXT | No | The display name. There is no separate display_name or username |
| description | TEXT | Yes | Bio |
| avatar_url | TEXT | Yes | Public `avatars` storage bucket, one folder per user |
| email | TEXT | Yes | UNIQUE. OTP-verified on change |
| phone | TEXT | Yes | UNIQUE. OTP-verified on change. A primary sign-in identifier |
| date_of_birth | DATE | Yes |  |
| location_text | TEXT | Yes | The human-readable label |
| location_point | GEOGRAPHY(POINT) | Yes | PostGIS, SRID 4326, **(longitude, latitude)** order |
| locale | TEXT | No | DEFAULT 'pt-PT'; CHECK IN (pt-PT, pt-BR, en). This is where the language setting lives |
| gender | TEXT | Yes | CHECK IN (male, female) — used by Mixed events |
| dominant_hand | TEXT | Yes | CHECK IN (left, right) |
| court_side | TEXT | Yes | CHECK IN (left, right) |
| preferred_time | TEXT | Yes | CHECK IN (any, morning, afternoon, night) |
| terms_accepted_at | TIMESTAMPTZ | Yes | Records implicit consent for social sign-ins |
| onboarded_at | TIMESTAMPTZ | Yes |  |
| notifications_prompted_at | TIMESTAMPTZ | Yes | Whether the prompt was PUT to the user, not the OS permission result |
| created_at | TIMESTAMPTZ | No | DEFAULT now() |

Two things that are not columns and are easy to get wrong:

- **`location_point` has exactly one sanctioned writer**, the `set_my_location(lat, lng, text)`
  function, which overwrites the point AND `location_text` together. It is not a merge, and neither
  column can ride along in an ordinary `profiles` UPDATE.
- **There is no `has_password` column.** It is a computed boolean on the `auth_providers` view,
  redefined by migration 0101 to mean "a password was actually chosen", backed by an
  `auth_password_set` table and a trigger. The older inference — a non-empty `encrypted_password` —
  read true for every OTP user, because GoTrue writes a placeholder hash on signup.

**blocks + reports**

CREATE TABLE blocks (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

created_at TIMESTAMPTZ DEFAULT now(),

CHECK (blocker_id \<\> blocked_id),

UNIQUE (blocker_id, blocked_id)

);

CREATE TABLE reports (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

reporter_id UUID NOT NULL REFERENCES profiles(id),

reported_user_id UUID NOT NULL REFERENCES profiles(id),

reason TEXT NOT NULL,

description TEXT,

status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),

created_at TIMESTAMPTZ DEFAULT now(),

CHECK (reporter_id \<\> reported_user_id)

);

**user_settings**

> **[Corrected 2026-09-22]** There is no `language` column and there never was — the language setting
> lives on `profiles.locale`. Section 6.2 previously said App preferences commits it here.

CREATE TABLE user_settings (

user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

notifications_push BOOLEAN NOT NULL DEFAULT true,

notifications_whatsapp BOOLEAN NOT NULL DEFAULT false,

notifications_email BOOLEAN NOT NULL DEFAULT false,

updated_at TIMESTAMPTZ DEFAULT now()

);

**subscriptions (player / Jammer+)**

CREATE TABLE subscriptions (

user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

status TEXT NOT NULL DEFAULT 'free'

CHECK (status IN ('free','trialing','active','cancelled')),

source TEXT CHECK (source IS NULL OR source IN ('direct','community_bundle')),

billing_cycle TEXT CHECK (billing_cycle IS NULL

OR billing_cycle IN ('annual','monthly')),

trial_ends_at TIMESTAMPTZ,

current_period_end TIMESTAMPTZ,

cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,

billing_provider_id TEXT,

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now()

);

**community_subscriptions (per community organizer tier)**

*Assumes communities (defined in the Communities doc) exists. owner_user_id is the community creator and the billing target.*

CREATE TABLE community_subscriptions (

community_id UUID PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,

owner_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

tier TEXT NOT NULL DEFAULT 'starter'

CHECK (tier IN ('starter','basic','community_pro')),

billing_cycle TEXT CHECK (billing_cycle IS NULL

OR billing_cycle IN ('annual','monthly')),

current_period_end TIMESTAMPTZ,

cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,

billing_provider_id TEXT,

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now()

);

**support_tickets**

CREATE TABLE support_tickets (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

title TEXT NOT NULL,

description TEXT NOT NULL,

status TEXT NOT NULL DEFAULT 'open'

CHECK (status IN ('open','responded','closed')),

created_at TIMESTAMPTZ DEFAULT now()

);

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE follows;

-- profiles, blocks, reports, user_settings, subscriptions,

-- community_subscriptions, and support_tickets are not realtime-critical

-- and are read on demand.

## Row Level Security policies

**profiles**

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- READ: profiles are public, EXCEPT a profile is hidden when a block

-- exists in either direction between the viewer and that profile.

CREATE POLICY "profiles: read" ON profiles FOR SELECT

USING (

NOT EXISTS (

SELECT 1 FROM blocks b

WHERE (b.blocker_id = auth.uid() AND b.blocked_id = profiles.id)

OR (b.blocked_id = auth.uid() AND b.blocker_id = profiles.id)

)

);

-- UPDATE: a user edits only their own profile.

CREATE POLICY "profiles: update" ON profiles FOR UPDATE

USING (id = auth.uid());

**blocks / reports / user_settings**

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- blocks: a user manages only their own blocks.

CREATE POLICY "blocks: own" ON blocks FOR ALL

USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- reports: a user creates and reads only their own reports.

CREATE POLICY "reports: own" ON reports FOR ALL

USING (reporter_id = auth.uid()) WITH CHECK (reporter_id = auth.uid());

-- user_settings: a user reads / writes only their own row.

CREATE POLICY "settings: own" ON user_settings FOR ALL

USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

**subscriptions / community_subscriptions / support_tickets**

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE community_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- subscriptions: a user reads only their own row; writes are server-side

-- (billing webhook + bundle reconciliation).

CREATE POLICY "subs: read" ON subscriptions FOR SELECT

USING (user_id = auth.uid());

-- community_subscriptions: the community owner and members can read the

-- row (so the client can render plan-gated UI).

-- Writes are server-side.

CREATE POLICY "comm_subs: read" ON community_subscriptions FOR SELECT

USING (

owner_user_id = auth.uid()

OR EXISTS (SELECT 1 FROM community_members cm

WHERE cm.community_id = community_subscriptions.community_id

AND cm.user_id = auth.uid())

);

-- support_tickets: a user creates and reads only their own tickets.

CREATE POLICY "tickets: own" ON support_tickets FOR ALL

USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

## Component & file map

> **[Removed 2026-09-22]** This section listed Next.js App Router paths under `src/app/(app)/`
> with shadcn components. That is not where this feature lives: the mobile app is Expo Router
> under `apps/mobile/app` with in-house primitives in `apps/mobile/components/ui`, and the web
> app is at `apps/web/src/app/(app)/app`. A map of files that do not exist is worse than no map —
> it sent readers to build in the wrong place. The real files, per screen, are named in
> `docs/audit/2026-09-22-ux-profile-settings-plan.md`.

## Claude Code prompts

> **[Removed 2026-09-22]** Three build prompts written against the same non-existent Next.js
> structure, ending in Playwright specs for a React Native app whose end-to-end suite is the
> idb-driven harness in `apps/mobile/e2e`. They also predate every decision the UX audit took.
> Superseded by the 21 pull requests in `docs/audit/2026-09-22-ux-profile-settings-plan.md`.

*Padel Jam • Profile & Settings • v1.3 • Wireframe-derived requirements*
