# Spec 06 — Scheduling & classes

**Goal:** The scheduling core: recurring classes with capacity, waitlists, cancellations,
coach assignment, and private classes; a drag-and-drop calendar in the dashboard; and
external calendar sync. Club owners schedule — members do not self-book in v1.

**Depends on:** 05.

## Tasks

1. Schema (migration), all tenant-scoped:
   - `classes` — template: title, description, coach_id, location_id, capacity,
     is_private, recurrence rule.
   - `class_sessions` — concrete dated instances generated from a class's recurrence.
   - `bookings` — member_id, class_session_id, status.
   - `waitlists` — member_id, class_session_id, position.
   - `attendance` — member_id, class_session_id, checked_in_at.
2. Recurrence: generate `class_sessions` from a recurrence rule (e.g. RRULE-style).
   Handle capacity limits, cancellations, and waitlist promotion when a spot frees up.
3. Dashboard calendar:
   - Drag-and-drop calendar management (FullCalendar) with coaches as resources.
   - Create/edit/cancel sessions, assign coaches, set capacity, mark private.
   - Respect role + location scope (a coach sees their sessions; staff their locations).
4. External calendar integration: sync sessions to Google Calendar and Outlook (Edge
   Functions handle the OAuth + push). This is a `pro`+ feature — gate by entitlement.
5. Realtime: class capacity, bookings, and schedule changes update live via Supabase
   Realtime (hooks in `packages/api/realtime`). Member-facing views reflect changes
   without refresh.
6. Surface read-only schedule views in the member `(app)` (from spec 04 shell): a member
   sees upcoming sessions they're booked into and class capacity, but does not self-book.

## Constraints

- All scheduling actions pass the two-check rule.
- Calendar sync and waitlists are entitlement-gated per plan.
- Booking/capacity logic lives in `packages/utils` (pure, testable), not in components.

## Definition of done

- [ ] A club owner creates a recurring class; sessions generate correctly.
- [ ] Capacity is enforced; exceeding it routes a member to the waitlist.
- [ ] Cancelling a booking promotes the next waitlisted member automatically.
- [ ] Drag-and-drop rescheduling works and respects coach/location scope.
- [ ] Google and Outlook sync push sessions (for an entitled tenant only).
- [ ] Capacity/booking changes appear live in member views via Realtime.
