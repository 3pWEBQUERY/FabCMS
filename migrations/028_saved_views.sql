-- Saved filters of a content list: «Meine Entwürfe», «Events nächsten Monat» – for oneself or the whole team.
create table saved_views (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  name text not null check (length(name) between 1 and 60),
  query jsonb not null,
  user_id uuid references users(id) on delete cascade,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index saved_views_collection_idx on saved_views (collection);
