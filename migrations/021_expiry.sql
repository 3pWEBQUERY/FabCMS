-- Expiry: an entry goes offline by itself at this time (an offer, an event notice).
alter table entries add column unpublish_at timestamptz;
create index entries_unpublish_at_idx on entries (unpublish_at) where unpublish_at is not null;
