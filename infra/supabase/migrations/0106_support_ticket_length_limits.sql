-- 0106_support_ticket_length_limits.sql
--
-- Requirements/profile.md §6.4 has always specified Contact support's two fields as "max 80 chars"
-- and "max 2000 chars". Nothing enforced either: `support_tickets.title` and `.description` were
-- unbounded `text` (0060), and neither app set a `maxLength`. The clients now cap input at the same
-- two numbers (SUPPORT_TITLE_MAX / SUPPORT_DESCRIPTION_MAX in packages/config), and this makes the
-- database the backstop for anything that reaches the table another way — PostgREST is open to
-- any authenticated caller, and the insert policy checks only that `user_id` is theirs.
--
-- `char_length`, not `octet_length`: the limit is characters, and a Portuguese title full of
-- accented letters takes two bytes a character. The clients' `maxLength` counts UTF-16 units,
-- which is never fewer than characters, so no client can produce a value this refuses.
--
-- Named so a violation says which field it was: PostgREST surfaces the constraint name in the
-- error, and so does the test that pins these (infra/supabase/tests/support-tickets.test.mjs).
--
-- HOSTED: validating a constraint checks every existing row, and this fails the whole script if
-- any row is already over. Count first:
--   select count(*) filter (where char_length(title) > 80)         as titles_over,
--          count(*) filter (where char_length(description) > 2000) as descriptions_over
--     from support_tickets;
-- Both zero, paste this. Not zero, stop: those rows need a decision before the limit can land.

alter table support_tickets
  add constraint support_tickets_title_length check (char_length(title) <= 80),
  add constraint support_tickets_description_length check (char_length(description) <= 2000);
