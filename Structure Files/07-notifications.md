# Spec 07 — Notifications

**Goal:** Push and email notifications from day-one events: class reminders, booking
confirmations, schedule changes, and waitlist promotions. Push via Expo, email via Resend.

**Depends on:** 04, 05.

## Tasks

1. Schema (migration), tenant-scoped where relevant:
   - `push_tokens` — user_id, token, platform.
   - `notifications` — user_id, type, payload, read_at.
   - `email_events` — log of sent emails (type, recipient, status).
2. Push notifications:
   - Register Expo push tokens on mobile login; store in `push_tokens`.
   - An Edge Function sends pushes via Expo Notifications for the key events
     (booking confirmed, class reminder, schedule change, waitlist promotion).
3. Email:
   - Integrate Resend. Build localized email templates (pt-PT, pt-BR, en) for the same
     key events. Log every send to `email_events`.
   - Use the `react-email` skill/package for templates if available.
4. Reminders: schedule class reminders ahead of `class_sessions` (e.g. a scheduled Edge
   Function or cron) respecting the member's locale and timezone (location timezone).
5. In-app notifications: surface `notifications` in both web `(app)` and mobile, with
   read/unread state. Realtime updates so the bell badge changes live.
6. Preferences: a basic per-user notification preference (push/email on/off per category)
   honored by the senders.

## Constraints

- All user-facing email/push copy is localized via `packages/i18n`.
- Reminder timing respects the location's timezone, not the server's.
- Sends are logged (`email_events`, `notifications`) for debugging and audit.

## Definition of done

- [ ] Booking a class triggers a confirmation push + email in the user's locale.
- [ ] A class reminder fires ahead of the session at the correct local time.
- [ ] A schedule change notifies affected members.
- [ ] Waitlist promotion notifies the promoted member.
- [ ] In-app notification bell updates live and tracks read/unread.
- [ ] Turning off a category stops those sends for that user.
