alter table communities
  add column created_by                   uuid references profiles(id),
  add column location                     text,
  add column thumbnail_path               text,
  add column cover_image_path             text,
  add column cancellation_rules_enabled   boolean not null default false,
  add column cancellation_rules_text      text,
  add column updated_at                   timestamptz not null default now();
-- enabled ⇒ non-empty text. (Archive uses the existing archived_at; no is_archived column.)
alter table communities add constraint communities_cancellation_rules_ck
  check (cancellation_rules_enabled = false
         or coalesce(length(btrim(cancellation_rules_text)), 0) > 0);
