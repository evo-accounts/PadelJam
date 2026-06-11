alter table groups
  add column created_by     uuid references profiles(id),
  add column description     text,
  add column thumbnail_path  text;
-- group archive also uses the existing archived_at (no is_archived).
