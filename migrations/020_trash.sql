-- Deleted entries wait here for 30 days: the whole row and everything that hangs
-- on it (versions, translations, comments), so restoring brings all of it back.
create table trash (
  id uuid primary key,
  collection text not null,
  title text not null default '',
  entry jsonb not null,
  related jsonb not null default '{}',
  deleted_by uuid references users on delete set null,
  deleted_at timestamptz not null default now()
);
create index trash_deleted_idx on trash (deleted_at desc);
