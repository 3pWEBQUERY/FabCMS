-- Gift cards: bought in the shop (or made by hand), redeemed at the checkout as a means of payment.
create table gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- upper case, e.g. 7KQ4-M2XP-9HTA
  initial integer not null check (initial > 0),
  balance integer not null check (balance >= 0),
  currency text not null default 'CHF',
  order_id uuid references orders on delete set null,
  email text not null default '',
  note text not null default '',
  active boolean not null default true,
  valid_until date,
  created_at timestamptz not null default now()
);
create index gift_cards_order_idx on gift_cards (order_id);
-- Every use: negative when spent on an order, positive when given back (order cancelled).
create table gift_card_uses (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references gift_cards on delete cascade,
  order_id uuid references orders on delete set null,
  amount integer not null,
  created_at timestamptz not null default now()
);
create index gift_card_uses_card_idx on gift_card_uses (card_id);
alter table orders add column gift_card text;
alter table orders add column gift_amount integer not null default 0;
