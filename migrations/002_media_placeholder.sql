-- Placeholder shown while an image loads: main colour and a tiny blurred preview (base64 WebP).
-- NULL = not computed yet; '' = no placeholder (image has transparency, or it could not be read).
alter table media add column color text;
alter table media add column lqip text;
