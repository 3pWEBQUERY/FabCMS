-- Spenden: one row per payment. A monthly donation creates a new row for every
-- month Stripe collects, so the books and the annual receipts add up.
create table donations (
  id uuid primary key default gen_random_uuid(),
  amount integer not null,                 -- cents
  currency text not null default 'CHF',
  interval text not null default 'once' check (interval in ('once', 'month')),
  campaign text not null default '',
  name text not null default '',
  email text not null,
  street text not null default '',         -- for the tax receipt
  zip text not null default '',
  city text not null default '',
  anonymous boolean not null default false,  -- not shown in the public list of supporters
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  token text not null unique,
  stripe_session text,
  stripe_subscription text,
  payment_ref text,
  parent_id uuid references donations on delete set null, -- later months of a monthly donation
  subscription_active boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index donations_campaign_idx on donations (campaign, status);
create index donations_email_idx on donations (lower(email));
create index donations_subscription_idx on donations (stripe_subscription);
