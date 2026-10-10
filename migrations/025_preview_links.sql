-- Links that show a draft to someone without an account: until a date, and only until revoked.
create table preview_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  entry_id uuid not null references entries(id) on delete cascade,
  lang text,
  note text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  uses int not null default 0
);
create index preview_links_entry_idx on preview_links (entry_id);
