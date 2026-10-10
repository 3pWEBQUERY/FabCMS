-- How an upload was checked before it was stored (structure only, or ClamAV with its version).
alter table media add column scan jsonb;
