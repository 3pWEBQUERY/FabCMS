-- Web versions of uploaded videos (H.264 MP4 in a few sizes plus a poster frame).
-- null = not a video, or uploaded before transcoding existed (queued on start).
alter table media add column video jsonb;
