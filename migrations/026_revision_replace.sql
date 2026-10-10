-- Search and replace keeps the state before it as a version of its own.
alter table revisions drop constraint if exists revisions_kind_check;
alter table revisions add constraint revisions_kind_check check (kind in ('autosave', 'publish', 'restore', 'import', 'replace'));
