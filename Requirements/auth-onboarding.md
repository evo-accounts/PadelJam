# Authentication — Splash, Welcome, Sign In / Sign Up, Onboarding

*Padel Jam — Version 1.2 • October 2026 • Welcome screen amended by the Welcome redesign (2026-10-04)*

*Changelog — v1.2 (2026-10-04): Welcome becomes a three-slide pager with two buttons, Get started and Sign in, both leading to Sign In / Sign Up; see the block below. v1.1 (May 2026): onboarding simplified — single Jammer+ gate + push prompt.*

This document defines the unauthenticated entry into Padel Jam — the splash and welcome screens that precede the auth wall — together with the unified sign-in / sign-up flow (modelled on Airbnb’s identifier-first pattern) and the onboarding sequence the user runs immediately after their first sign-up. The two subscription destinations the onboarding feeds into — Jammer+ and the Community plans — are owned by the Profile / Communities documents; this doc only references them.

> **Amended 2026-10-04 by the Welcome redesign** (the Welcome screens in the “PJAM - Mobile App” Figma file, which
> replace the placeholder carousel first built under UX-AUTH-01). Only the Welcome screen and its first-install
> flag change; Splash, Sign In / Sign Up and Onboarding are as before. Rows and paragraphs marked *(amended,
> welcome redesign)* carry the outcome. In short:
>
> - **Two buttons, not one.** Under the copy, every slide shows “Get started” (primary) and “Sign in”
>   (secondary). They are the same destination: each sets the first-install flag and replaces Welcome with the
>   combined Sign In / Sign Up screen (“Login or Sign Up”). There is no separate returning-user screen, and
>   Create your account is not a target because it needs a live session.
> - **One pager, three slides.** An edge-to-edge mascot illustration fills the top of the screen, under a fixed
>   light sheet with rounded top corners. Swiping anywhere on the illustration or the copy moves to the next
>   slide: the illustration and the copy slide together, while the sheet, the page dots and the two buttons stay put.
> - **The copy is final** (English in 4.2; pt-PT and pt-BR live in the app’s string catalogue), replacing the
>   “final copy TBD” placeholders.
> - **The flag is the same flag.** Only who sets it changes: either button now sets `hasSeenWelcome`. Devices that
>   already have it keep skipping Welcome.

**Confirmed design decisions**

- App boot order: Splash → Welcome (first install only) → Sign In / Sign Up → Onboarding (new accounts) → Jammer+ subscription gate → Home (push-notifications permission prompt fires on first arrival). Returning users skip Welcome.

- Sign-in and sign-up share a single identifier-first screen — the user enters either an email or a phone number; the system sends a 6-digit OTP to the chosen channel.

- Every account links one email AND one phone. A user who started via phone is asked to add email + password to complete the account; a user who started via email is asked to add phone + password. This is what guarantees the link.

- “Try another way” is the universal recovery affordance: switch the OTP channel, fall back to password, or use Apple / Google if those are linked to the same identifier.

- Apple and Google can be linked at any sign-in; if no profile matches the social-provider email, the user is routed into the same account-completion screen used for direct sign-up.

- Onboarding is optional — every step has a Skip. Skipping at any point routes the user straight to the Jammer+ subscription gate. Community plans are only surfaced later, inside the Create Community wizard (Communities doc).

- Community paid plans (Organizer, Community Pro) include Jammer+ at no extra charge. The full plan matrix lives in the Profile document’s Subscription section.

## Overview

**What this document covers**

Four things: the Splash screen, the Welcome screen, the unified Sign In / Sign Up flow, and the post-sign-up Onboarding sequence (which ends at the Jammer+ subscription gate).

**How it fits**

- Splash is the very first frame the user sees on every app launch. It routes them based on auth and onboarding state.

- Welcome is shown only on first install (or after a full logout that clears local state).

- Sign In / Sign Up is the only gate to the authenticated app; everything in Home / Events / Community / Profile sits behind it.

- Onboarding runs once, immediately after the first sign-up. After it the user lands on Home.

**Out of scope**

- Editing profile fields after onboarding (Profile doc).

- The Jammer+ and Community subscription plan details — pricing, features, trial mechanics (Profile doc — Subscription section). The Community subscription gate itself (now reached from inside the Create Community wizard) lives in the Communities doc.

- The Create Community wizard internals (Communities doc).

- Re-running onboarding from settings later (Profile doc).

## Data model

Two tables touched. Auth identity itself — email, phone, password hashes, OAuth links, session tokens — is handled by Supabase Auth (auth.users) and not redefined here. profiles holds the app-side identity and the onboarding answers. Subscription tables are owned by the Profile / Communities docs.

| **profiles** | App-side user identity, mirrored 1:1 from auth.users.id. Stores the linked email + phone pair, the full name, and the onboarding answers. |
|----|----|
| **auth_providers (view)** | A thin read-only view over auth.identities that exposes which providers (email, phone, google, apple) are linked to the current user — used by “Try another way” to know which fallbacks to show. |

## Splash screen

The first frame on every app launch. The Padel Jam logo is centered on a brand background while the client checks the auth + onboarding state and decides where to route the user next.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.1 Behaviour</strong></th>
</tr>
<tr>
<th><strong>Visual</strong></th>
<th>Brand-colored full-screen background with the Padel Jam logo centered. No copy, no spinner; a subtle progress indicator may appear if the routing check takes longer than 600 ms.</th>
</tr>
<tr>
<th><strong>Min display</strong></th>
<th>600 ms minimum so the splash does not flash; if routing resolves faster, the splash is held until 600 ms have elapsed.</th>
</tr>
<tr>
<th><strong>Max display</strong></th>
<th>4 s. If the routing check has not resolved by then, the client treats the user as unauthenticated and routes to Welcome (first install) or Sign In / Sign Up.</th>
</tr>
<tr>
<th><strong>Routing — authenticated + onboarded</strong></th>
<th>Goes directly to Home.</th>
</tr>
<tr>
<th><strong>Routing — authenticated + not onboarded</strong></th>
<th>Resumes Onboarding at the first incomplete step (profiles fields are inspected to find the resume point).</th>
</tr>
<tr>
<th><strong>Routing — unauthenticated, first install</strong></th>
<th>Goes to Welcome.</th>
</tr>
<tr>
<th><strong>Routing — unauthenticated, returning device</strong></th>
<th>Goes to Sign In / Sign Up.</th>
</tr>
<tr>
<th><strong>“First install” flag</strong></th>
<th>A local flag (e.g. AsyncStorage / localStorage hasSeenWelcome) is set the first time the user dismisses Welcome with <s>Start now</s> <em>(amended, welcome redesign)</em> either button, Get started or Sign in. Logging out does not clear it; only a full app reinstall does. <em>(amended)</em> If the flag cannot be saved, the button still goes on to Sign In / Sign Up; Welcome then shows again on the next launch.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Welcome screen

~~A short, three-card horizontal carousel that introduces the app on first install. Reached from Splash; never shown again on the device once the user has tapped Start now (or completed a sign-in by any other means).~~ *(amended, welcome redesign)* A short, three-slide horizontal pager that introduces the app on first install. Reached from Splash; never shown again on the device once the user has tapped Get started or Sign in (or completed a sign-in by any other means).

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.1 Layout</strong></th>
</tr>
<tr>
<th><strong>Container</strong></th>
<th><s>A single white card filling most of the screen, sitting on a soft brand-tinted backdrop.</s> <em>(amended, welcome redesign)</em> The whole screen. The illustration runs edge to edge across the top, under the status bar. A fixed light sheet with rounded top corners rises over the lower part of the illustration and holds the copy, the page dots and the two buttons.</th>
</tr>
<tr>
<th><strong>Media</strong></th>
<th><s>A large image area takes the upper two-thirds of the card.</s> <em>(amended)</em> The illustration takes the upper part of the screen; the sheet keeps its own height, so the illustration grows or shrinks with the device. It is decorative and hidden from assistive technology.</th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th><s>A bold one-line headline (e.g. “Find your community!”). Final copy TBD.</s> <em>(amended)</em> A bold, centred headline of up to two lines. Two lines are always reserved, so the illustration and the buttons stay put between slides and between languages. Copy in 4.2.</th>
</tr>
<tr>
<th><strong>Body</strong></th>
<th>Two lines of supporting copy below the title. <s>Final copy TBD.</s> <em>(amended)</em> Centred, with two lines reserved as for the title. Copy in 4.2.</th>
</tr>
<tr>
<th><strong>Pagination</strong></th>
<th>Three dot indicators below the body, the active dot filled. The user can either swipe horizontally or wait for content; auto-advance is not in the MVP. <em>(amended)</em> The dots sit between the copy and the buttons and do not move. Swiping starts anywhere on the illustration or the copy; the illustration and the copy slide together while the sheet, the dots and the buttons stay in place, and the pager does not bounce past the first or last slide.</th>
</tr>
<tr>
<th><strong>Primary CTA</strong></th>
<th><s>A full-width “Start now” button at the bottom. Visible on every card. Tapping it dismisses the carousel and goes to Sign In / Sign Up regardless of which card is active.</s> <em>(amended, welcome redesign)</em> A full-width “Get started” button (filled, the primary style) under the dots. Visible on every slide. Tapping it sets the first-install flag and replaces Welcome with Sign In / Sign Up, regardless of which slide is active.</th>
</tr>
<tr>
<th><strong>Secondary CTA</strong> <em>(amended, welcome redesign)</em></th>
<th>A full-width “Sign in” button (the secondary, light style) directly under “Get started”. Visible on every slide. It does exactly what “Get started” does: sets the first-install flag and replaces Welcome with the same combined Sign In / Sign Up screen. There is no separate returning-user screen.</th>
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
<th colspan="2"><strong>4.2 Content cards</strong></th>
</tr>
<tr>
<th><strong>Card 1</strong></th>
<th><s>Theme: Community. Placeholder title “Find your community!”. Final copy and image TBD.</s> <em>(amended, welcome redesign)</em> Theme: nearby games. Title “Find games near you”. Body “Take a peek at nearby padel courts. Your next match might be closer than you think.” Illustration: a fox.</th>
</tr>
<tr>
<th><strong>Card 2</strong></th>
<th><s>Theme: Events / play. Placeholder title TBD.</s> <em>(amended)</em> Theme: creating and joining games. Title “Create or join in seconds”. Body “Start a session or reserve your spot in just a few taps. Then… relax until game time.” Illustration: a bear.</th>
</tr>
<tr>
<th><strong>Card 3</strong></th>
<th><s>Theme: Growth / improvement. Placeholder title TBD.</s> <em>(amended)</em> Theme: the padel community. Title “Explore your padel community”. Body “Find players at your level, so you can stop carrying the whole game.” Illustration: a turtle and a rabbit.</th>
</tr>
<tr>
<th><strong>Note</strong></th>
<th><s>The card structure is fixed (image / title / body / dots / CTA). The actual copy and imagery are owned by Marketing and finalised separately; this doc only locks the structure.</s> <em>(amended, welcome redesign)</em> The slide structure is fixed (illustration / title / body, then the dots and the two CTAs); this doc only locks the structure. The English copy above is final and ships. The Portuguese versions (pt-PT, pt-BR) are in the app’s string catalogue; the three illustrations are the mascot artwork from the design file.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Sign In / Sign Up

A unified, identifier-first flow modelled on Airbnb. The user enters either an email or a phone number; the system sends a 6-digit OTP and uses the same screens for both login (existing account) and sign-up (new account). The only divergence is at the end — a new user is asked to complete the account with the missing identifier, full name, and password; an existing user lands on Home.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.1 Identifier-first screen</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Login or Sign Up”.</th>
</tr>
<tr>
<th><strong>Two variants</strong></th>
<th>Phone variant (default) shows a country-code selector + mobile number input. Email variant shows a single email input. The bottom social row swaps the third button: phone variant offers “Continue with email”; email variant offers “Continue with phone”.</th>
</tr>
<tr>
<th><strong>Primary CTA</strong></th>
<th>A “Continue” button. Disabled until the input passes basic format validation (E.164 phone or RFC-5322 email).</th>
</tr>
<tr>
<th><strong>Social buttons</strong></th>
<th>Below a divider: Continue with Google, Continue with Apple, and (third) the channel-swap entry (“Continue with email” or “Continue with phone”).</th>
</tr>
<tr>
<th><strong>On Continue</strong></th>
<th>The client calls the OTP-start endpoint with the identifier. The server creates or reuses an auth.users row and sends a 6-digit OTP via the chosen channel. The client then pushes the OTP verification screen.</th>
</tr>
<tr>
<th><strong>Account existence</strong></th>
<th>The screen never reveals whether the identifier already belongs to an account — a freshly created user and an existing one are both sent to OTP verification with the same UX. The branch only resolves after the code is verified.</th>
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
<th colspan="2"><strong>5.2 OTP verification</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Confirm if it’s you”.</th>
</tr>
<tr>
<th><strong>Subtitle</strong></th>
<th>Tells the user where the code went: “We’ve sent a verification code via SMS to your number: (00) 000-0000” or “via email to your email address: email@example.com”.</th>
</tr>
<tr>
<th><strong>Input</strong></th>
<th>Six single-digit boxes filled left-to-right by an in-screen numeric keypad. Pasting a 6-digit code from the OS clipboard fills all boxes at once.</th>
</tr>
<tr>
<th><strong>OTP rules</strong></th>
<th>6 digits, valid for 10 minutes. Maximum 5 verification attempts before the code is invalidated and the user must request a new one.</th>
</tr>
<tr>
<th><strong>Resend code</strong></th>
<th>A “Resend code” link below the input. Disabled with a 30-second cooldown after every send. The first send happens when the screen is first reached.</th>
</tr>
<tr>
<th><strong>Primary CTA</strong></th>
<th>“Continue”. Disabled until all six digits are entered. Submitting verifies the code server-side.</th>
</tr>
<tr>
<th><strong>Try another way</strong></th>
<th>A secondary link at the bottom of the screen (“Try another way”). Opens the modal sheet in 5.3.</th>
</tr>
<tr>
<th><strong>On success — existing account</strong></th>
<th>A profiles row is found for the verified identifier — the user is signed in and lands on Home.</th>
</tr>
<tr>
<th><strong>On success — new account</strong></th>
<th>No profiles row exists for the verified identifier — the user is taken to the Create your account screen (5.7) to complete the missing fields.</th>
</tr>
<tr>
<th><strong>On failure</strong></th>
<th>Wrong code shows an inline error under the input (“That code doesn’t match. Try again.”). Expired code shows (“That code has expired. Tap Resend code.”) and re-enables the Resend link.</th>
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
<th colspan="2"><strong>5.3 Try another way</strong></th>
</tr>
<tr>
<th><strong>Entry point</strong></th>
<th>The “Try another way” link on the OTP verification screen (5.2). Opens a bottom sheet / modal.</th>
</tr>
<tr>
<th><strong>Dynamic options</strong></th>
<th>The sheet lists only the channels that are actually linked to the account being signed into. For a brand-new identifier with no existing account, only the channel-swap entry is shown.</th>
</tr>
<tr>
<th><strong>Channel swap</strong></th>
<th>If the user started with phone and the account has an email linked, an option “Get a code via email: e**l@example.com” is shown (with the email masked). The reciprocal is shown when starting with email.</th>
</tr>
<tr>
<th><strong>Password</strong></th>
<th>If the account has a password set, an “Enter password” option is shown. Selecting it routes to the password sign-in screen (5.4).</th>
</tr>
<tr>
<th><strong>Google</strong></th>
<th>If the account has Google linked, a “Continue with Google” option is shown. Selecting it launches the Google OAuth flow.</th>
</tr>
<tr>
<th><strong>Apple</strong></th>
<th>If the account has Apple linked, a “Continue with Apple” option is shown. Selecting it launches the Sign in with Apple flow.</th>
</tr>
<tr>
<th><strong>Close</strong></th>
<th>Tapping outside the sheet (or the close icon) dismisses it; the user returns to the OTP screen with no state change.</th>
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
<th colspan="2"><strong>5.4 Password sign-in fallback</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Confirm if it’s you”.</th>
</tr>
<tr>
<th><strong>Input</strong></th>
<th>A single password field. The user is implicitly bound to the identifier they entered on 5.1.</th>
</tr>
<tr>
<th><strong>Forgot password link</strong></th>
<th>A “Forgot password?” link below the input launches the password recovery flow (5.5).</th>
</tr>
<tr>
<th><strong>Primary CTA</strong></th>
<th>“Continue”. Submitting authenticates with identifier + password against Supabase Auth.</th>
</tr>
<tr>
<th><strong>Try another way</strong></th>
<th>Same affordance as the OTP screen — returns the user to the modal in 5.3 so they can try yet another channel.</th>
</tr>
<tr>
<th><strong>Errors</strong></th>
<th>Wrong password shows inline (“That password doesn’t match our records.”). After 5 failed attempts in a 10-minute window the password path is rate-limited and the inline error becomes (“Too many attempts. Use Try another way or wait a few minutes.”).</th>
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
<th colspan="2"><strong>5.5 Password recovery</strong></th>
</tr>
<tr>
<th><strong>Entry point</strong></th>
<th>The “Forgot password?” link on 5.4.</th>
</tr>
<tr>
<th><strong>Step 1 — Send code</strong></th>
<th>Title: “Password recovery”. A code is automatically dispatched to the account’s email address (“We’ve sent a verification code to your email: email@example.com”). The user enters the 6-digit code (same 6-box widget as 5.2). A “Resend code” link is provided with the same 30-second cooldown.</th>
</tr>
<tr>
<th><strong>Step 2 — New password</strong></th>
<th>Title: “New password”. Two fields: New password and Confirm new password. Both required; must match; must satisfy password policy (≥ 8 chars).</th>
</tr>
<tr>
<th><strong>Step 3 — Success</strong></th>
<th>Title: “Your password has been successfully changed.” Body: “Go to the login screen to continue your registration.” (copy is reused from the wireframe). A single primary CTA returns the user to the identifier-first screen (5.1).</th>
</tr>
<tr>
<th><strong>Side effects</strong></th>
<th>Resetting the password invalidates all existing sessions for that account; the user must sign in fresh on every device.</th>
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
<th colspan="2"><strong>5.6 Social sign-in (Google / Apple)</strong></th>
</tr>
<tr>
<th><strong>Entry points</strong></th>
<th>Direct buttons on the identifier-first screen (5.1), or via Try another way (5.3) when the social provider is linked to the looked-up account.</th>
</tr>
<tr>
<th><strong>Provider flow</strong></th>
<th>Launches the Supabase Auth OAuth handshake for Google or the native Sign in with Apple flow. Returns a verified email and (Apple, first time only) a display name.</th>
</tr>
<tr>
<th><strong>Existing account by email</strong></th>
<th>If the returned email matches an existing profiles row, the social provider is linked to that row (if not already) and the user is signed in straight to Home.</th>
</tr>
<tr>
<th><strong>No existing account</strong></th>
<th>No profiles row matches the returned email — the user is taken to Create your account (5.7) with the email + name pre-filled and disabled. The user still has to add the phone number and create a password.</th>
</tr>
<tr>
<th><strong>Conflict</strong></th>
<th>If the returned email already exists but is linked to a different auth identity (e.g. Apple returns a relay email that conflicts), the user is informed inline (“This email is already linked to a different sign-in. Use that one instead.”) and bounced back to 5.1.</th>
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
<th colspan="2"><strong>5.7 Create your account (sign-up branch)</strong></th>
</tr>
<tr>
<th><strong>Trigger</strong></th>
<th>Reached only when OTP verification (5.2) succeeds but no profiles row exists for the verified identifier; also reached from social sign-in (5.6) when no profile matches the returned email.</th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Create your account” with a back arrow.</th>
</tr>
<tr>
<th><strong>Variant — came in via phone</strong></th>
<th>Fields: Full name (required) → Mobile number (pre-filled, disabled — already verified) → Password (required). The user fills name + password; the phone is locked because it was verified by OTP.</th>
</tr>
<tr>
<th><strong>Variant — came in via email</strong></th>
<th>Fields: Full name (required) → Email (pre-filled, disabled — already verified) → Mobile number (required, with country code selector) → Password (required). Note the wireframe omits the locked mobile field; the implementation should treat it as locked when the user reached this screen via phone OTP.</th>
</tr>
<tr>
<th><strong>Variant — came in via Google / Apple</strong></th>
<th>Fields: Full name (pre-filled from provider if available) → Email (pre-filled, disabled) → Mobile number (required) → Password (required). Password is required even with social linkage so the user has every method available for later sign-in.</th>
</tr>
<tr>
<th><strong>Terms checkbox</strong></th>
<th>A required checkbox: “I have read and agree to the Terms of Use and Privacy Policy.” Continue stays disabled until it is checked.</th>
</tr>
<tr>
<th><strong>Password policy</strong></th>
<th>Minimum 8 characters. No other complexity rules in the MVP; show a soft hint (“8+ characters”) under the field.</th>
</tr>
<tr>
<th><strong>Secondary identifier verification</strong></th>
<th>The identifier added on this screen (email or phone, whichever was NOT the OTP channel) is stored but NOT verified at this moment. Verification happens lazily the first time the user tries to sign in via that channel — we send an OTP to it at that point.</th>
</tr>
<tr>
<th><strong>On Continue</strong></th>
<th>Creates the profiles row with all four fields (id, email, phone, full_name) populated and the password stored on auth.users via Supabase Auth. The user is then routed to Onboarding (section 06).</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Onboarding

A short sequence that runs once, immediately after a successful sign-up. Every step has a Skip in the top-right; the user can also tap through linearly. Onboarding always ends at the Jammer+ subscription gate, and from there the user lands on Home where a push-notifications permission prompt fires on first arrival.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.1 Sequence</strong></th>
</tr>
<tr>
<th><strong>Order</strong></th>
<th>Location → Dominant hand → Court side → Jammer+ subscription gate → Home (notifications prompt).</th>
</tr>
<tr>
<th><strong>Skip</strong></th>
<th>Every step has a “Skip” link in the top-right of the header. Tapping Skip on any step shortcuts the user straight to the Jammer+ subscription gate; none of the unanswered steps are revisited.</th>
</tr>
<tr>
<th><strong>Continue</strong></th>
<th>The bottom CTA on each step is “Continue”. It advances to the next step and persists the chosen value on profiles.</th>
</tr>
<tr>
<th><strong>Resume</strong></th>
<th>If the user leaves the app mid-onboarding, the next launch resumes from the first unanswered step. Their previous answers are pre-filled. onboarded_at is not set until the user clears the Jammer+ gate.</th>
</tr>
<tr>
<th><strong>Re-running</strong></th>
<th>Onboarding is run only once. Editing the same fields later happens from Profile (out of scope for this doc).</th>
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
<th colspan="2"><strong>6.2 Step — Your location</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Your Location”.</th>
</tr>
<tr>
<th><strong>Entry layout</strong></th>
<th>A centered map-pin icon over two stacked full-width buttons: a primary “Allow Current Location” and a secondary “Enter Address Manually”. A Skip link sits in the top-right of the header.</th>
</tr>
<tr>
<th><strong>Path A — Allow Current Location</strong></th>
<th>Tapping “Allow Current Location” triggers the native iOS / Android location permission prompt directly (“Allow PadelJam to use your location?” with Allow Once / Allow While Using App / Don’t Allow on iOS, and the equivalent on Android). On Allow Once or Allow While Using App, the device GPS is read, reverse-geocoded to a human-readable address, and the step advances to 6.3 with the address pre-filled. On Don’t Allow, the screen falls back to Path B (the manual-entry view opens automatically). The OS-level decision is not stored — the client only consumes the resulting coordinates if granted.</th>
</tr>
<tr>
<th><strong>Path B — Enter Address Manually</strong></th>
<th>Tapping “Enter Address Manually” opens a full-screen map view: an “×” close button top-left and a search input at the bottom titled “What’s your address?” (placeholder “Enter your address”). As the user types, a dropdown of address suggestions appears (places autocomplete). Tapping a suggestion zooms the map to the selected pin and replaces the search input with a confirmation card showing the resolved address (e.g. “LaunchPad @ one-north, 75 Ayer Rajah Cres / Singapore, 139953”) plus an inline edit (pencil) icon that re-opens the search. A primary “Continue” button at the bottom commits the address.</th>
</tr>
<tr>
<th><strong>Storage</strong></th>
<th>Stored as profiles.location_text (the human-readable string) plus profiles.location_point (the resolved lat / lng as a PostGIS POINT). Skipping leaves both null.</th>
</tr>
<tr>
<th><strong>Skip / Continue</strong></th>
<th>Standard: Skip exits onboarding straight to the Jammer+ gate; Continue (from Path A success, Path B confirmation, or the entry screen if a location was already resolved) advances to 6.3.</th>
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
<th colspan="2"><strong>6.3 Step — Dominant hand</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“My dominant hand is…”.</th>
</tr>
<tr>
<th><strong>Options</strong></th>
<th>Two large selectable cards: Left, Right.</th>
</tr>
<tr>
<th><strong>Selection</strong></th>
<th>Single-select. The chosen card highlights; the other deselects. Continue stays disabled until one is selected (Skip is always available).</th>
</tr>
<tr>
<th><strong>Storage</strong></th>
<th>profiles.dominant_hand ∈ { left, right }.</th>
</tr>
<tr>
<th><strong>Skip / Continue</strong></th>
<th>Skip exits onboarding to the Jammer+ gate; Continue advances to 6.4. A Back button returns to 6.2.</th>
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
<th colspan="2"><strong>6.4 Step — Court side</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“What side of the court do you play?”.</th>
</tr>
<tr>
<th><strong>Visual</strong></th>
<th>A court diagram with two stick figures labelled Left and Right. The user taps the side they play on.</th>
</tr>
<tr>
<th><strong>Selection</strong></th>
<th>Single-select.</th>
</tr>
<tr>
<th><strong>Storage</strong></th>
<th>profiles.court_side ∈ { left, right }.</th>
</tr>
<tr>
<th><strong>Skip / Continue</strong></th>
<th>Skip exits onboarding to the Jammer+ gate; Continue advances to 6.5. A Back button returns to 6.3.</th>
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
<th colspan="2"><strong>6.5 Jammer+ subscription gate</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Play premium Padel experiences with Jammer+”.</th>
</tr>
<tr>
<th><strong>Body</strong></th>
<th>A bullet list of Jammer+ benefits. The full benefit list is owned by the Profile doc — Subscription section; this gate just renders whatever is configured there.</th>
</tr>
<tr>
<th><strong>Plan options</strong></th>
<th>Two cards: Annually (€39.00/year, labelled “Most popular”) and Monthly (€4.99/month). Indicative prices — the source of truth is the Profile doc.</th>
</tr>
<tr>
<th><strong>Continue with free</strong></th>
<th>A secondary link “Not sure yet? Continue with free” sits below the cards and exits the gate without subscribing. The user lands on Home with the free tier.</th>
</tr>
<tr>
<th><strong>Primary CTA</strong></th>
<th>“Continue” — starts the paid subscription with the selected plan via Stripe (or the configured billing provider). On success the user lands on Home.</th>
</tr>
<tr>
<th><strong>Trial CTA</strong></th>
<th>“Try 7-day trial” below the primary CTA — starts a trial of the selected plan, no charge for 7 days, then auto-renews unless cancelled. On success the user lands on Home.</th>
</tr>
<tr>
<th><strong>Skipped onboarding</strong></th>
<th>When the user reached this gate via Skip earlier in onboarding, the experience is identical — only the route in differs.</th>
</tr>
<tr>
<th><strong>onboarded_at</strong></th>
<th>Set on any of the three exits (Continue, Try trial, Continue with free). After this write, the user is routed to Home.</th>
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
<th colspan="2"><strong>6.6 Push notifications permission prompt</strong></th>
</tr>
<tr>
<th><strong>Trigger</strong></th>
<th>The first time the user arrives at Home after onboarding is complete (any exit from 6.5 has just set profiles.onboarded_at and routed here). Tracked by a local flag (e.g. hasRequestedPushPermission in AsyncStorage / localStorage) so the prompt does not re-fire on subsequent Home arrivals.</th>
</tr>
<tr>
<th><strong>Behaviour</strong></th>
<th>Home mounts, then the client immediately calls the native push-permission API (Notifications.requestPermissionsAsync on iOS, the runtime POST_NOTIFICATIONS permission request on Android 13+). This shows the native OS modal (e.g. “PadelJam Would Like to Send You Notifications” with Don’t Allow / Allow on iOS).</th>
</tr>
<tr>
<th><strong>On Allow</strong></th>
<th>The Expo / FCM push token is registered with Supabase (a user_devices row with platform + token). The local flag is set so the prompt is not requested again automatically.</th>
</tr>
<tr>
<th><strong>On Don’t Allow</strong></th>
<th>No token is registered. The local flag is still set — the prompt does not re-fire automatically. Re-enabling notifications later requires the user to flip the toggle in Settings (Profile / Settings doc, Notifications screen), which deep-links to the OS app settings if the OS-level permission is still denied.</th>
</tr>
<tr>
<th><strong>No pre-prompt</strong></th>
<th>There is no custom in-app explainer before the OS modal. The OS modal is fired directly on first Home mount.</th>
</tr>
<tr>
<th><strong>Skip-path users</strong></th>
<th>A user who skipped every onboarding step still reaches 6.5 and then 6.6 — the prompt fires regardless of how many onboarding fields they filled in.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed AU (Auth & Onboarding).

| **ID** | **Requirement** | **Priority** | **Notes** |
|----|----|----|----|
| AU-01 | Splash screen is the first frame on every app launch; routes based on auth + onboarded state. | **Must** |  |
| AU-02 | *(amended 2026-10-04)* Welcome screen is shown only on first install; a 3-slide horizontal pager (illustration, title, body) over a fixed sheet with the page dots and two CTAs, “Get started” and “Sign in”, both leading to Sign In / Sign Up. | **Must** | Local flag persisted across logout; either CTA sets it. |
| AU-03 | Sign In / Sign Up is a single identifier-first screen accepting either an email or a phone number. | **Must** |  |
| AU-04 | The system sends a 6-digit OTP via the chosen channel; the same screens are used for login and sign-up. | **Must** | Supabase Auth OTP. |
| AU-05 | A new user (no profiles row) is routed to the Create your account screen after OTP verification. | **Must** |  |
| AU-06 | Account completion captures the missing identifier (email or phone), full name, and password, and links them to the same auth.users row. | **Must** | NOT NULL on profiles.email and profiles.phone after completion. |
| AU-07 | The secondary identifier captured at account completion is verified lazily — OTP is sent the first time the user signs in via that channel. | Should |  |
| AU-08 | Continue with Google and Continue with Apple are available on the identifier-first screen and inside Try another way. | **Must** | Supabase Auth OAuth. |
| AU-09 | Social sign-up routes through Create your account with email + name pre-filled and disabled; phone + password are still required. | **Must** |  |
| AU-10 | Try another way exposes only the channels actually linked to the looked-up account, with masked identifiers. | **Must** |  |
| AU-11 | Password sign-in is available as a fallback from Try another way, with a Forgot password link. | **Must** |  |
| AU-12 | Password recovery sends a 6-digit code to the account email, accepts a new password (≥ 8 chars), and shows a success screen. | **Must** |  |
| AU-13 | Resetting the password invalidates all existing sessions for that account. | **Must** |  |
| AU-14 | OTP codes are 6 digits, valid for 10 minutes, with a maximum of 5 attempts and a 30-second Resend cooldown. | **Must** |  |
| AU-15 | The Terms of Use / Privacy Policy checkbox is required to enable Continue on Create your account. | **Must** |  |
| AU-16 | Onboarding runs once, immediately after the first sign-up. Each step has a Skip. | **Must** |  |
| AU-17 | Onboarding steps in order: Your location, Dominant hand, Court side, Jammer+ subscription gate. | **Must** |  |
| AU-18 | Skip on any onboarding step shortcuts to the Jammer+ subscription gate and writes no value for the unanswered fields. | **Must** |  |
| AU-19 | The Your Location step offers two entries: Allow Current Location (triggers the native OS permission modal directly) and Enter Address Manually (opens the map / search flow). Don’t Allow on the OS modal falls back to the manual-entry view. | **Must** |  |
| AU-20 | profiles.onboarded_at is set only when the user clears the Jammer+ subscription gate (any exit option: Continue, Try trial, Continue with free). | **Must** |  |
| AU-21 | If the user leaves the app mid-onboarding, the next launch resumes at the first unanswered step. | Should |  |
| AU-22 | All onboarding fields are nullable and can be edited later from Profile. | **Must** |  |
| AU-23 | On the first Home arrival after onboarding, the native OS push-notifications permission prompt is requested directly (no custom pre-prompt). A local flag prevents re-prompting on subsequent Home arrivals. | **Must** |  |

## Database schema

Supabase Auth (auth.users, auth.identities) handles email, phone, password hash, and OAuth provider links. The app-side profile mirrors auth.users.id and adds onboarding fields.

**profiles**

| **Column** | **Type** | **Nullable** | **Notes** |
|----|----|----|----|
| id | UUID | No | PK, also FK to auth.users(id) ON DELETE CASCADE |
| email | TEXT | No | UNIQUE; mirrors the verified email on auth.users |
| phone | TEXT | No | UNIQUE; E.164 format; mirrors the verified phone on auth.users |
| full_name | TEXT | No | Captured at account completion |
| avatar_url | TEXT | Yes | Optional; set later from Profile |
| location_text | TEXT | Yes | Human-readable location string from onboarding step 6.2 |
| location_point | GEOGRAPHY(POINT) | Yes | Resolved lat / lng for nearby queries |
| dominant_hand | TEXT | Yes | CHECK IN ('left','right') |
| court_side | TEXT | Yes | CHECK IN ('left','right') |
| onboarded_at | TIMESTAMPTZ | Yes | Set when the user clears the final subscription gate; null means routing should send them back into Onboarding |
| created_at | TIMESTAMPTZ | No | default now() |

CREATE TABLE profiles (

id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

email TEXT NOT NULL UNIQUE,

phone TEXT NOT NULL UNIQUE,

full_name TEXT NOT NULL,

avatar_url TEXT,

location_text TEXT,

location_point GEOGRAPHY(POINT),

dominant_hand TEXT CHECK (dominant_hand IN ('left','right')),

court_side TEXT CHECK (court_side IN ('left','right')),

onboarded_at TIMESTAMPTZ,

created_at TIMESTAMPTZ NOT NULL DEFAULT now()

);

*The canonical INSERT is performed by the client at the end of the Create your account screen so all four NOT NULL fields are populated atomically.*

**auth_providers (helper view)**

A thin view exposing which providers are linked to the current authenticated user. Drives the dynamic options shown in Try another way (5.3).

CREATE VIEW auth_providers WITH (security_invoker = true) AS

SELECT

u.id AS user_id,

(u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL) AS has_email,

(u.phone IS NOT NULL AND u.phone_confirmed_at IS NOT NULL) AS has_phone,

EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'google') AS has_google,

EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'apple') AS has_apple,

(u.encrypted_password IS NOT NULL) AS has_password

FROM auth.users u;

## Row Level Security policies

**profiles**

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- READ: any authenticated user can read any profile (so the app can render

-- other users in lists, events, communities, etc.).

CREATE POLICY "profiles: read" ON profiles FOR SELECT

USING (auth.role() = 'authenticated');

-- INSERT: a user can only insert their own row, and only with their own id.

CREATE POLICY "profiles: insert" ON profiles FOR INSERT

WITH CHECK (id = auth.uid());

-- UPDATE: a user can only update their own row.

CREATE POLICY "profiles: update" ON profiles FOR UPDATE

USING (id = auth.uid());

-- DELETE: not exposed to clients. Account deletion is performed by an edge

-- function that also deletes the auth.users row (the FK cascades).

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase Auth + shadcn/ui + Tailwind.

src/app/(public)/splash/page.tsx Splash + routing

src/app/(public)/welcome/page.tsx Welcome carousel host

src/components/welcome/WelcomeCarousel.tsx 3-card swiper

src/components/welcome/WelcomeCard.tsx Single card (image / title / body)

src/app/(public)/auth/page.tsx Identifier-first screen (5.1)

src/components/auth/IdentifierForm.tsx Phone / email variants + social row

src/components/auth/SocialButtons.tsx Google / Apple / channel-swap

src/components/auth/OtpScreen.tsx OTP verification (5.2)

src/components/auth/OtpInput.tsx 6-box code input

src/components/auth/Numpad.tsx In-screen numeric keypad

src/components/auth/TryAnotherWaySheet.tsx Modal sheet (5.3)

src/components/auth/PasswordForm.tsx Password fallback (5.4)

src/components/auth/PasswordRecovery.tsx Forgot password (5.5)

src/components/auth/NewPasswordForm.tsx Set new password

src/components/auth/PasswordChangedScreen.tsx Success state

src/components/auth/CreateAccountForm.tsx Account completion (5.7)

src/lib/hooks/useAuthFlow.ts State machine for the unified flow

src/app/(onboarding)/layout.tsx Onboarding shell (Skip + progress)

src/app/(onboarding)/location/page.tsx Step 6.2 — Allow / Manual entry + map+autocomplete confirm src/components/onboarding/LocationEntryScreen.tsx Two-button entry (Allow / Manual)

src/components/onboarding/ManualAddressMap.tsx Map + search + suggestion list + confirm card

src/app/(onboarding)/hand/page.tsx Step 6.3

src/app/(onboarding)/side/page.tsx Step 6.4

src/app/(onboarding)/jammer-plus/page.tsx Jammer+ gate (6.5)

src/components/onboarding/SkipLink.tsx Header skip affordance

src/components/onboarding/PlanCard.tsx Reusable plan card (Jammer+ / Community)

src/lib/hooks/useOnboarding.ts Resume logic + profile writes

src/lib/hooks/usePushPermissionPrompt.ts Fires the native push prompt on first Home mount (local flag-guarded)

src/components/push/registerPushToken.ts Registers the Expo / FCM token in user_devices on Allow

## Claude Code prompts

Run the section 08 schema and section 09 RLS as Supabase migrations first. Then run the prompts in order.

**Prompt 1 — Splash, Welcome, Sign In / Sign Up**

**Build the unauthenticated entry of Padel Jam.**

- Build the Splash screen at /splash that checks the Supabase session and the profiles.onboarded_at value, holds for a minimum 600 ms, and routes to /welcome (first-install), /auth (returning unauthenticated), the first unanswered onboarding step (authenticated, not onboarded), or /home (authenticated, onboarded). Persist the “has-seen-welcome” flag in localStorage.

- ~~Build the Welcome carousel at /welcome — three swipable cards with image / title / body / dots / “Start now” CTA. Start now routes to /auth and sets the local flag.~~ *(amended, welcome redesign)* Build the Welcome pager at /welcome — three swipable slides (illustration / title / body) over a fixed sheet that holds the dots and two CTAs, “Get started” and “Sign in”. Both set the local flag and route to /auth.

- Build the unified Sign In / Sign Up flow at /auth as a single state machine (useAuthFlow.ts) with steps: identifier → otp → (try another way) → password / recovery → create-account. Use Supabase Auth’s signInWithOtp (email + phone), verifyOtp, signInWithPassword, signInWithOAuth (Google, Apple), and resetPasswordForEmail. The identifier-first screen has two variants (phone with country selector / email) toggled by the third social button; the OTP screen uses an in-screen numeric keypad and a 6-box input with paste support; the Try another way sheet must call the auth_providers view to discover which fallbacks to show. The Create your account screen is reached only when verifyOtp succeeds with no matching profiles row (or after a social sign-in with no profile); it captures the missing identifier, full name, and password and writes the profiles row atomically.

- Implement the OTP rules: 6 digits, 10-minute expiry, 30-second resend cooldown, 5-attempt cap. Implement the password rules: ≥ 8 characters with an inline hint. Enforce the required Terms checkbox on Create your account. Write a Playwright spec covering: identifier → otp → home for an existing user, identifier → otp → create-account → home for a new user, password fallback via Try another way, and the full password-recovery happy path.

**Prompt 2 — Onboarding**

**Build the Onboarding sequence for Padel Jam.**

- Build the onboarding shell at /onboarding with a shared layout exposing a Skip link (top-right) on every step. Steps in order: /location, /hand, /side, /jammer-plus. Each step’s Continue persists the answer on profiles and advances; each step’s Skip jumps directly to /jammer-plus and writes nothing to the unanswered fields. The shell’s mount logic must read profiles to find the first unanswered step and redirect there (resume behaviour).

- Build the location step (/location) as a two-screen flow. Entry screen: a centered map-pin icon over a primary “Allow Current Location” button and a secondary “Enter Address Manually” button. The Allow button calls the native location-permission API directly (expo-location requestForegroundPermissionsAsync or the equivalent web API), receives the GPS coordinates on Allow, reverse-geocodes them via a places API, and advances. On Don’t Allow, the manual-entry screen opens automatically. Manual screen (ManualAddressMap.tsx): full-screen map (Google Maps embed or Mapbox) with an “×” close button, a search input at the bottom (“What’s your address?”) whose autocomplete suggestions render as a dropdown above the keyboard, and a confirmation card that replaces the search input when a suggestion is chosen (shows the resolved address with an edit pencil icon, plus a primary Continue button). Both paths write profiles.location_text and profiles.location_point.

- Build the dominant-hand (/hand) and court-side (/side) steps as single-select card grids writing profiles.dominant_hand and profiles.court_side. Both screens have Back, Skip, and Continue affordances.

- Build /jammer-plus with the Annually / Monthly cards, the “Not sure yet? Continue with free” secondary link, the primary Continue (starts a paid subscription via the billing provider), and the Try 7-day trial secondary CTA. All prices and feature bullets come from the Subscription module of the Profile doc — read them from there at render time rather than hard-coding. Set profiles.onboarded_at when the user clears the gate by any exit (Continue, Try trial, Continue with free).

- Build usePushPermissionPrompt.ts and call it from the Home page mount: if the local hasRequestedPushPermission flag is unset, request the native push-notifications permission directly (no custom pre-prompt). On Allow, register the Expo / FCM token in user_devices via registerPushToken.ts. On Don’t Allow, do nothing further. Set the local flag in both cases so the prompt does not re-fire on subsequent Home arrivals.

- Write a Playwright spec covering: the linear happy path Location (Allow) → Hand → Side → Jammer+ → Home; the manual-entry path (decline OS prompt, pick a suggestion, confirm); a mid-step Skip jumping straight to Jammer+; an onboarding resume across a page reload; and the Home mount firing the push prompt exactly once.

*Padel Jam • Authentication & Onboarding • v1.1 • Onboarding simplified — single Jammer+ gate + push prompt*
