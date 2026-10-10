-- Folders of the media library exist on their own – also empty, before the first file.
create table media_folders (
  name text primary key check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
insert into media_folders (name) select distinct folder from media where folder <> '' and not private on conflict do nothing;
