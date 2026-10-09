-- Newsletter light: subscribers with double opt-in, issues and a send log
-- (one row per recipient, so an interrupted send resumes without duplicates).
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed')),
  token text not null unique,          -- confirm and unsubscribe link
  source text not null default '',     -- page the form was on, «admin», «import»
  ip text not null default '',         -- proof of consent, together with confirmed_at
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz
);
create unique index subscribers_email_idx on subscribers (lower(email));
create index subscribers_status_idx on subscribers (status);

create table newsletters (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  intro text not null default '',
  entry_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  auto boolean not null default false,
  recipients integer not null default 0,
  created_by uuid references users on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table newsletter_sends (
  newsletter_id uuid not null references newsletters on delete cascade,
  subscriber_id uuid not null references subscribers on delete cascade,
  sent_at timestamptz not null default now(),
  ok boolean not null default true,
  primary key (newsletter_id, subscriber_id)
);
