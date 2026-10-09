-- Nova CMS – initial schema.
-- Flexible content lives in JSONB; everything with real relational meaning
-- (orders, contacts, sessions) gets proper columns.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('owner', 'admin', 'editor', 'author', 'member')),
  mode text not null default 'studio' check (mode in ('studio', 'werkbank')),
  totp_secret text,
  totp_enabled boolean not null default false,
  sessions_count integer not null default 0,
  seen_hints text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_email_idx on users (lower(email));

create table sessions (
  id text primary key, -- sha256 of the cookie token
  user_id uuid not null references users on delete cascade,
  pending_2fa boolean not null default false,
  user_agent text not null default '',
  ip text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table collections (
  id text primary key,
  name text not null,
  singular text not null,
  icon text not null default 'page',
  fields jsonb not null default '[]',
  route text,
  list_route text,
  has_blocks boolean not null default false,
  builtin boolean not null default false,
  module text,
  title_field text not null default 'title',
  empty_hint text,
  sort jsonb,
  per_page integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  collection text not null references collections on delete cascade on update cascade,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'scheduled', 'published')),
  data jsonb not null default '{}',
  published_data jsonb,
  -- slug at the time of the last publish; a change creates a 301 redirect
  published_slug text,
  publish_at timestamptz,
  published_at timestamptz,
  author_id uuid references users on delete set null,
  version integer not null default 1,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection, slug)
);
create index entries_collection_idx on entries (collection, status);
create index entries_publish_at_idx on entries (publish_at) where status = 'scheduled';
create index entries_search_idx on entries using gin (
  to_tsvector('simple', coalesce(data ->> 'title', '') || ' ' || coalesce(data ->> 'excerpt', '') || ' ' || coalesce(data ->> 'description', ''))
);

create table revisions (
  id bigserial primary key,
  entry_id uuid not null references entries on delete cascade,
  data jsonb not null,
  kind text not null default 'autosave' check (kind in ('autosave', 'publish', 'restore', 'import')),
  user_id uuid references users on delete set null,
  created_at timestamptz not null default now()
);
create index revisions_entry_idx on revisions (entry_id, created_at desc);

create table redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique,
  to_path text not null,
  code integer not null default 301 check (code in (301, 302, 410)),
  auto boolean not null default false,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);

create table media (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null,
  filename text not null,
  mime text not null,
  size bigint not null,
  width integer,
  height integer,
  alt text not null default '',
  caption text not null default '',
  focus jsonb not null default '{"x": 0.5, "y": 0.5}',
  edits jsonb not null default '{}',
  folder text not null default '',
  tags text[] not null default '{}',
  version integer not null default 1,
  private boolean not null default false,
  uploaded_by uuid references users on delete set null,
  created_at timestamptz not null default now()
);
create index media_folder_idx on media (folder, created_at desc);

create table forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fields jsonb not null default '[]',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  email text,
  name text not null default '',
  phone text not null default '',
  company text not null default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'offer', 'won', 'lost')),
  source text not null default '',
  notes jsonb not null default '[]',
  value_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contacts_email_idx on contacts (lower(email)) where email is not null;

create table submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms on delete cascade,
  contact_id uuid references contacts on delete set null,
  data jsonb not null,
  files jsonb not null default '[]',
  page text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index submissions_form_idx on submissions (form_id, created_at desc);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  min_total integer not null default 0,
  max_uses integer,
  uses integer not null default 0,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index coupons_code_idx on coupons (upper(code));

create sequence order_number_seq start 1001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')),
  email text not null,
  customer jsonb not null,
  items jsonb not null,
  subtotal integer not null,
  discount integer not null default 0,
  shipping integer not null default 0,
  total integer not null,
  vat jsonb not null default '[]',
  currency text not null default 'CHF',
  coupon text,
  payment_method text not null,
  payment_ref text,
  note text not null default '',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_created_idx on orders (created_at desc);
create index orders_email_idx on orders (lower(email));

create table comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries on delete cascade,
  name text not null,
  email text not null default '',
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'spam')),
  created_at timestamptz not null default now()
);
create index comments_entry_idx on comments (entry_id, status, created_at);

create table analytics_events (
  id bigserial primary key,
  ts timestamptz not null default now(),
  kind text not null default 'pageview' check (kind in ('pageview', 'goal')),
  path text not null,
  referrer text not null default '',
  visitor text not null,
  device text not null default 'desktop',
  goal text,
  value_cents integer
);
create index analytics_ts_idx on analytics_events (ts);
create index analytics_kind_ts_idx on analytics_events (kind, ts);

create table audit_log (
  id bigserial primary key,
  user_id uuid references users on delete set null,
  action text not null,
  entity text not null default '',
  entity_id text not null default '',
  meta jsonb not null default '{}',
  ip text not null default '',
  created_at timestamptz not null default now()
);
create index audit_created_idx on audit_log (created_at desc);

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  scopes text[] not null default '{read}',
  created_by uuid references users on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table backups (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null,
  size bigint not null,
  kind text not null default 'auto',
  created_at timestamptz not null default now()
);
