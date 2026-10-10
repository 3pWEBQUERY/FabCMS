-- Installed extensions (Marktplatz): the manifest as installed and what it created,
-- so an update replaces exactly that and removing takes back exactly that.
create table extensions (
  id text primary key,
  version text not null,
  source text not null,
  manifest jsonb not null,
  created jsonb not null default '{}',
  installed_by uuid references users on delete set null,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
