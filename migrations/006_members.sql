-- Mitgliederbereich: accounts for website visitors, separate from the team's
-- admin users (own table, own sessions, own cookie).
create table members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'blocked')),
  email_verified_at timestamptz,
  newsletter_optin boolean not null default false, -- ticked at sign-up; applied once the address is confirmed
  paid_until timestamptz,                          -- granted by hand, or end of the paid Stripe period
  stripe_customer text,
  stripe_subscription text,
  subscription_status text not null default '',   -- Stripe: active, trialing, past_due, canceled …
  note text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index members_email_idx on members (lower(email));
create index members_subscription_idx on members (stripe_subscription);

create table member_sessions (
  id text primary key, -- sha256 of the cookie token
  member_id uuid not null references members on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index member_sessions_member_idx on member_sessions (member_id);

-- One-time links: confirm the address, set a new password.
create table member_tokens (
  id text primary key, -- sha256 of the token in the link
  member_id uuid not null references members on delete cascade,
  kind text not null check (kind in ('verify', 'reset')),
  expires_at timestamptz not null
);
