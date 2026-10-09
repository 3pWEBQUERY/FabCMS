-- Events & Tickets, Kurse: one engine for both. An order holds one or more
-- tickets (one per person); each ticket has its own code for the QR check-in.
create table ticket_orders (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references entries on delete set null,
  entry_title text not null default '',   -- kept for the books if the event is deleted
  name text not null,
  email text not null,
  phone text not null default '',
  items jsonb not null default '[]',      -- [{ category, qty, price }]
  total integer not null default 0,       -- cents
  currency text not null default 'CHF',
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  token text not null unique,             -- private link for the buyer
  payment_ref text,
  source text not null default 'web',     -- web, admin
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index ticket_orders_entry_idx on ticket_orders (entry_id, status);
create index ticket_orders_email_idx on ticket_orders (lower(email));

create table tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ticket_orders on delete cascade,
  entry_id uuid,
  category text not null,
  code text not null unique,              -- printed and in the QR code
  checked_in_at timestamptz,
  checked_in_by uuid references users on delete set null,
  created_at timestamptz not null default now()
);
create index tickets_entry_idx on tickets (entry_id);

-- Sold out: people can ask to be told when a place frees up.
create table ticket_waitlist (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index ticket_waitlist_unique on ticket_waitlist (entry_id, lower(email));
