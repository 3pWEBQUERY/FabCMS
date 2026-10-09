-- Reservation & Termine: what can be booked (services), with what or whom (resources),
-- the bookings themselves and times that are not bookable (closures, imported busy times).
create table booking_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  duration_min integer not null default 60,
  buffer_min integer not null default 0,
  price integer,                      -- cents, shown only; null = no price shown
  deposit integer not null default 0, -- cents, paid online when booking (needs Stripe)
  resource_ids uuid[] not null default '{}', -- empty = any active resource
  active boolean not null default true,
  sort_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table booking_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'table',   -- table, staff, room
  capacity integer not null default 2,  -- seats for tables/rooms; 1 for staff
  hours jsonb,                          -- own opening hours; null = business hours
  ical_url text not null default '',    -- busy times imported from another calendar
  active boolean not null default true,
  sort_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references booking_services on delete set null,
  resource_id uuid references booking_resources on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,          -- includes the buffer, so overlaps are simple
  party_size integer not null default 1,
  name text not null,
  email text not null default '',
  phone text not null default '',
  note text not null default '',
  internal_note text not null default '',
  status text not null default 'confirmed', -- pending, awaiting_payment, confirmed, cancelled, no_show, done
  source text not null default 'web',       -- web, phone, walk_in
  token text not null unique,
  deposit integer not null default 0,
  payment_ref text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_time_idx on bookings (starts_at);
create index bookings_resource_idx on bookings (resource_id, starts_at);

create table booking_blocks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references booking_resources on delete cascade, -- null = everything
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  source text not null default 'manual', -- manual, ical
  created_at timestamptz not null default now()
);
create index booking_blocks_time_idx on booking_blocks (starts_at, ends_at);
