-- Collaborative editing: the Yjs state of an entry (per language), so every editor shares one history.
create table entry_ydocs (
  entry_id uuid not null references entries(id) on delete cascade,
  lang text not null default '',
  state bytea not null,
  updated_at timestamptz not null default now(),
  primary key (entry_id, lang)
);
