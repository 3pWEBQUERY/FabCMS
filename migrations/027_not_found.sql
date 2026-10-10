-- Addresses visitors asked for that don't exist: how often, since when, from where.
create table not_found (
  path text primary key,
  hits int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  referrer text,
  ignored boolean not null default false
);
create index not_found_hits_idx on not_found (hits desc) where not ignored;
