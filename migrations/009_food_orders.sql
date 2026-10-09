-- Bestellung & Lieferung: take-away and delivery orders from the menu (dishes).
-- Separate from shop orders: other flow (kitchen board, time slot, pay on site).
create table food_orders (
  id uuid primary key default gen_random_uuid(),
  number integer not null,                 -- running number of the day, called out at the counter
  mode text not null check (mode in ('pickup', 'delivery')),
  slot_at timestamptz not null,            -- when the guest wants it
  name text not null,
  phone text not null default '',
  email text not null,
  street text not null default '',
  zip text not null default '',
  city text not null default '',
  note text not null default '',
  items jsonb not null,                    -- [{ id, title, size, price, q, vat }]
  subtotal integer not null,
  delivery_fee integer not null default 0,
  total integer not null,
  vat jsonb not null default '[]',
  currency text not null default 'CHF',
  payment text not null check (payment in ('online', 'onsite')),
  status text not null default 'new' check (status in ('pending_payment', 'new', 'preparing', 'ready', 'out', 'done', 'cancelled')),
  token text not null unique,
  payment_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index food_orders_slot_idx on food_orders (slot_at);
create index food_orders_status_idx on food_orders (status);
create index food_orders_email_idx on food_orders (lower(email));
