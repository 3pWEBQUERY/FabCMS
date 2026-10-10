-- Roles defined in the Werkbank: a name and a hand-picked set of rights.
create table roles (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text not null,
  help text not null default '',
  caps jsonb not null default '[]'::jsonb,
  werkbank boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A user's role is a built-in one or one of the table above (checked by the app,
-- which also moves people before a role is deleted).
alter table users drop constraint if exists users_role_check;
