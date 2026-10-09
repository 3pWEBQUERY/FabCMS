-- Team comments on a page or entry, optionally pinned to one block.
create table entry_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  block_id text,
  parent_id uuid references entry_comments(id) on delete cascade,
  body text not null,
  author_id uuid references users(id) on delete set null,
  mentions uuid[] not null default '{}',
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entry_comments_entry_idx on entry_comments (entry_id, created_at);

-- Personal notifications (mentions, replies): only this person sees them.
alter table notifications add column user_id uuid references users(id) on delete cascade;
create index notifications_user_idx on notifications (user_id) where user_id is not null;
