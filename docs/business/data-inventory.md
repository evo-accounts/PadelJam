# Data inventory (launch plan #9a)

_Owner: Head of Business. Draft 2026-11-06, written from a read of the repo on `main` and from PAD-65. **The CTO confirms it against the code (PAD-241 part 3).** Facts only; no legal text, no legal conclusions (gate 5). "Not confirmed" means I could not see it from the repo (hosted settings, vendor account state)._

## 1. What we collect

| Data | Where it is stored | Source in code | Who can see it |
|---|---|---|---|
| Email, phone number (identifiers on the account) | `auth.users` and `public.profiles` (`email`, `phone`, both unique) | `infra/supabase/migrations/0003_profiles.sql` | The user; service role. Organisers get invitees' emails only through a server function (`send-blast`), never as raw rows |
| Name, avatar URL | `profiles` | profile migrations | Other members, per RLS |
| **Gender** (`male`/`female`) and **date of birth** | `profiles` (`gender`, `date_of_birth`) | `0056_profile_fields.sql` | Not confirmed which fields other users can read: CTO to say |
| Padel Level | `profiles` (Level line approved on PAD-65, live on `/privacy` via PAD-64) | | Per RLS |
| **Location**: typed text and map point | `profiles` (`location_text`, `location_point`); device GPS only when the user allows it (foreground, "when in use") | `apps/mobile/app/(onboarding)/location.tsx`, `app.json` permission strings | Not confirmed: whether the exact point is visible to others |
| Communities, groups, events, matches, results, follows, blocks, posts, comments, likes, reviews, invitations, join requests | Supabase tables, scoped per tenant | `infra/supabase/migrations` | Members, per RLS |
| Chat messages and channels | Stream (not Supabase) | `packages/chat`, `stream-token`, `ensure-channel` | Channel members; Stream |
| Push tokens (Expo token, platform) | `push_tokens`; `delivery_log`, `notifications` | `apps/mobile/lib/push.ts`, `send-push` | The user; service role |
| Reports about other users | `reports` | | **Nobody can read them today** (launch plan #45, D9) |
| Support tickets | `support_tickets` | | Not confirmed |
| Event roster CSV, blast emails | Generated on request and emailed | `send-roster-csv`, `send-blast` | The organiser |
| Crash and performance data | Sentry, if a DSN is set (`tracesSampleRate 0.1`). Not wired natively yet | `apps/mobile/lib/sentry.ts`, `apps/web/src/lib/sentry.ts` | Not confirmed: what Sentry captures by default (IP, user id); DSN state on hosted |
| Account deletion | Rewrites email/phone to placeholders, clears avatar and location | `delete-account`, migrations | |

Analytics: none found in the repo (no PostHog, Amplitude or similar). CTO to confirm.

## 2. Third parties

| Party | What it receives | Why | Notes |
|---|---|---|---|
| **Supabase** | Everything in the tables above; auth | Database, auth, edge functions | Region: not confirmed (hosted, needed for transfer wording) |
| **Stream** | Chat messages, user ids, display data | Chat | Region not confirmed |
| **Resend** | Recipient email addresses and message content (auth mail via SMTP on, blast and roster emails) | Email | PAD-144: SMTP on, `smtp.resend.com` |
| **Sentry** | Error and trace data | Diagnostics | Missing from the 4 July policy (A24) |
| **Twilio** | Phone numbers and SMS codes | Phone sign-in by SMS | Account and keys still set on hosted (PAD-144). Phone sign-in is being hidden (PAD-137, row #44). **CTO to say whether any Twilio data flow remains after the hide**; if not, Twilio may drop off the list |
| **OpenStreetMap Nominatim** | Search text typed into place search, through the `geocode` function (web); mobile uses the OS geocoder (`expo-location`) | Address search | Web calls go through our function; the user's IP is not forwarded (CTO to confirm) |
| **Apple** (APNs, Sign in with Apple) and **Google** (FCM, Google sign-in) | Push tokens and payloads; sign-in identity | Push and social sign-in | Android push (FCM) not set up yet (A2, A6) |
| **Expo** | Push token routing | Push delivery | |
| **Vercel** | Web requests and logs | Web hosting | |
| **EAS / Expo** | Build artefacts only | | Not user data |

## 3. Questions for the CTO

1. Are the fields above complete? Anything else stored (device ids, IP, logs)?
2. Which profile fields (gender, date of birth, exact map point) can other users read?
3. What does Sentry send by default in this setup?
4. After the phone-sign-in hide, does Twilio still receive anything?
5. Supabase and Stream regions, and retention (deleted accounts, chat, logs).
6. Anything missing from my list of third parties?
