-- The onboarding notifications step (UX-AUTH-03) had no way to be resumed into.
--
-- `onboardingRoute()` picks the first unanswered step by reading profile
-- columns — location_text, dominant_hand, court_side. Notifications had no
-- column, so it could not appear in that sequence at all: a user who quit after
-- the side step and relaunched resumed straight at jammer-plus, never being
-- asked. The step existed and worked, but only if you walked the flow in one
-- sitting.
--
-- A timestamp rather than a boolean, and set for SKIP as well as for enable:
-- what the routing needs to know is "has this been PUT to the user", not "did
-- they say yes". The OS owns the answer, and re-asking someone who declined is
-- exactly the behaviour the audit objects to.
alter table profiles add column if not exists notifications_prompted_at timestamptz;

comment on column profiles.notifications_prompted_at is
  'When the onboarding notifications step was shown and answered or skipped. Drives onboardingRoute(); not a record of the permission result, which belongs to the OS.';
