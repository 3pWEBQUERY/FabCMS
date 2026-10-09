-- In-app notifications: what happened on the site that someone in the team should see.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,               -- form, order, paid, comment, review, stock, system
  cap text not null,                -- capability needed to see it (roles decide who is told)
  title text not null,
  body text not null default '',
  href text not null default '',    -- admin path to open
  created_at timestamptz not null default now()
);
create index notifications_created_idx on notifications (created_at desc);

create table notification_reads (
  notification_id uuid not null references notifications on delete cascade,
  user_id uuid not null references users on delete cascade,
  primary key (notification_id, user_id)
);
