-- Translations overlay the original entry: only the text fields live here,
-- prices, stock, images, dates and relations stay with the original.
create table entry_translations (
  entry_id uuid not null references entries(id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}$'),
  collection text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  data jsonb not null default '{}',
  published_data jsonb,
  published_slug text,
  published_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id) on delete set null,
  primary key (entry_id, lang)
);
create unique index entry_translations_slug on entry_translations (collection, lang, slug);
create index entry_translations_published on entry_translations (lang, collection) where status = 'published';
