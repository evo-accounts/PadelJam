-- profiles.email becomes nullable (mirrors 0084, which did the same for phone). The
-- secondary identifier is no longer attached unverified at account completion (M12):
-- complete-account creates the profile from whatever is verified on auth.users, and the
-- secondary lands on the profile only after an OTP round-trip (GoTrue email_change /
-- phone_change verified -> sync_profile_contact trigger from 0058). A phone-first user
-- therefore has a profile with a NULL email until (unless) they verify one. The UNIQUE
-- constraint stays — Postgres allows multiple NULLs.
alter table profiles alter column email drop not null;
