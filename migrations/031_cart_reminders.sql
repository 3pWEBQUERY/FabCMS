-- A reminder for a cart left at the checkout, asked for by ticking a box there. One mail at most;
-- name, address and items are wiped after 14 days, the row (for the counts) after 90.
create table cart_reminders (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text not null,
  name text not null default '',
  items jsonb not null,
  lang text not null default '',
  created_at timestamptz not null default now(),
  remind_at timestamptz not null,
  sent_at timestamptz,
  ordered_at timestamptz
);
create index cart_reminders_due_idx on cart_reminders (remind_at) where sent_at is null and ordered_at is null;
create index cart_reminders_email_idx on cart_reminders (lower(email));
