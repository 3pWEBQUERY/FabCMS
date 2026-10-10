import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql, json } from './db';
import { env } from './env';
import { storage } from './storage';
import { bumpGeneration } from './settings';
import type { VideoInfo, VideoRendition } from '../shared/types';

/**
 * Web versions of uploaded videos. Phones film in HEVC, QuickTime or at
 * 60 Mbit/s – the website should not hand that to visitors. Every video gets
 * H.264/AAC MP4s (moov atom first, so playback starts at once) at 1080p and
 * 720p – or its own size when smaller – plus a poster frame. The original
 * stays for downloads and as the last fallback.
 *
 * One video at a time, in the background, with ffmpeg. Without ffmpeg (or
 * with NOVA_VIDEO=off) videos are delivered as uploaded, as before.
 */

/** Short side of the web versions; sources smaller than the smallest get one version at their own size. */
const SIZES = [1080, 720] as const;
const MAX_RATE: Record<number, string> = { 1080: '5M', 720: '2500k' };
const RUN_LIMIT = 30 * 60_000;

let toolsOk: Promise<boolean> | null = null;
export function videoToolsAvailable(): Promise<boolean> {
  if (!env.video.enabled) return Promise.resolve(false);
  toolsOk ??= Promise.all([run(env.video.ffmpeg, ['-hide_banner', '-version'], 10_000), run(env.video.ffprobe, ['-version'], 10_000)]).then(
    () => true,
    () => false,
  );
  return toolsOk;
}

function run(cmd: string, args: string[], limit = RUN_LIMIT): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    const timer = setTimeout(() => p.kill('SIGKILL'), limit);
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(signal === 'SIGKILL' ? 'Zeitlimit überschritten' : err.trim().split('\n').slice(-3).join(' ') || `Exit ${code}`));
    });
  });
}

interface Probe {
  width: number;
  height: number;
  duration: number;
  audio: boolean;
  codec: string;
}

async function probe(file: string): Promise<Probe | null> {
  const out = await run(env.video.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], 60_000);
  const j = JSON.parse(out) as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
    format?: { duration?: string };
  };
  const v = j.streams?.find((s) => s.codec_type === 'video' && s.width && s.height);
  if (!v) return null;
  const rotation = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  // ffmpeg turns upright while converting, so sizes are those of the picture as it is seen.
  const [width, height] = rotation === 90 ? [v.height!, v.width!] : [v.width!, v.height!];
  return {
    width,
    height,
    duration: Number(j.format?.duration ?? 0) || 0,
    audio: Boolean(j.streams?.some((s) => s.codec_type === 'audio')),
    codec: v.codec_name ?? '',
  };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Which versions to make for a picture of this size. */
export function plannedSizes(width: number, height: number): { p: number; width: number; height: number }[] {
  const short = Math.min(width, height);
  const fit = (p: number) => {
    const k = p / short;
    return { p, width: even(width * k), height: even(height * k) };
  };
  const sizes = SIZES.filter((p) => p <= short).map(fit);
  return sizes.length ? sizes : [{ p: short, width: even(width), height: even(height) }];
}

async function setVideo(id: string, v: VideoInfo) {
  await sql`update media set video = ${json(v)} where id = ${id}`;
}

async function transcode(id: string): Promise<void> {
  const [m] = await sql`select id, storage_key, mime, private from media where id = ${id}`;
  if (!m) return;
  const dir = await mkdtemp(join(tmpdir(), 'nova-video-'));
  try {
    const original = await storage.getBuffer(m.storage_key);
    if (!original) throw new Error('Originaldatei fehlt');
    const src = join(dir, 'source');
    await writeFile(src, original);
    const info = await probe(src).catch(() => null);
    if (!info) return setVideo(id, { status: 'skipped', error: 'Keine Videospur gefunden' });
    const webReady = m.mime === 'video/mp4' && info.codec === 'h264';

    const renditions: VideoRendition[] = [];
    for (const size of plannedSizes(info.width, info.height)) {
      const out = join(dir, `${size.p}.mp4`);
      const rate = MAX_RATE[size.p] ?? '1500k';
      await run(env.video.ffmpeg, [
        ...['-hide_banner', '-loglevel', 'error', '-y', '-i', src],
        ...['-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-map_metadata', '-1'],
        ...['-vf', `scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`],
        ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high', '-maxrate', rate, '-bufsize', rate.replace(/\d+/, (n) => String(Number(n) * 2))],
        ...['-c:a', 'aac', '-b:a', '128k', '-ac', '2'],
        ...['-movflags', '+faststart', '-threads', '2', out],
      ]);
      const key = `media/${id}/video/${size.p}.mp4`;
      const buf = await readFile(out);
      await rm(out, { force: true });
      // An H.264 MP4 already plays everywhere; a bigger copy of it helps nobody.
      if (webReady && buf.length >= original.length) continue;
      await storage.put(key, buf, 'video/mp4');
      renditions.push({ ...size, key, size: buf.length });
    }

    // Poster: a frame a little way in (the very first is often black), at most 1280 px wide.
    const posterFile = join(dir, 'poster.jpg');
    const at = info.duration > 2 ? Math.min(1.5, info.duration * 0.1) : 0;
    await run(env.video.ffmpeg, [
      ...['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', src],
      ...['-frames:v', '1', '-vf', `scale='min(1280,iw)':-2`, '-q:v', '3', posterFile],
    ]);
    // Stored as WebP: a third of the JPEG's size, and every browser that plays H.264 shows it.
    let poster: string | undefined;
    if ((await stat(posterFile).catch(() => null))?.size) {
      poster = `media/${id}/video/poster.webp`;
      await storage.put(poster, await sharp(posterFile).webp({ quality: 78 }).toBuffer(), 'image/webp');
    }

    await setVideo(id, { status: 'ready', duration: Math.round(info.duration * 10) / 10, width: info.width, height: info.height, renditions, poster });
    bumpGeneration(); // pages showing this video pick up the web versions
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/* ---------- queue: one at a time, in this process ---------- */

let running: Promise<void> | null = null;
let again = false;

async function drain() {
  do {
    again = false;
    for (;;) {
      const [next] = await sql`
        update media set video = jsonb_set(video, '{status}', '"working"')
        where id = (select id from media where video ->> 'status' = 'queued' order by created_at limit 1 for update skip locked)
        returning id`;
      if (!next) break;
      try {
        await transcode(next.id as string);
      } catch (e) {
        const error = (e as Error).message.slice(0, 300);
        console.error(`[video] ${next.id}: ${error}`);
        await setVideo(next.id as string, { status: 'failed', error });
      }
    }
  } while (again);
}

/** Starts working through queued videos (no-op while it already runs). */
export function kickVideoQueue(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = drain().finally(() => (running = null));
  return running;
}

/** Resolves when the queue has nothing left to do (tests). */
export const videoQueueIdle = () => running ?? Promise.resolve();

/** A freshly uploaded (or retried) video: web versions if ffmpeg is there, otherwise as uploaded. */
export async function queueVideo(id: string): Promise<void> {
  if (!(await videoToolsAvailable())) return setVideo(id, { status: 'skipped', error: env.video.enabled ? 'ffmpeg fehlt auf dem Server' : 'ausgeschaltet' });
  await setVideo(id, { status: 'queued' });
  void kickVideoQueue();
}

/** On start: videos from before, and any that were cut off by a restart. */
export async function resumeVideos(): Promise<number> {
  if (!(await videoToolsAvailable())) return 0;
  const rows = await sql`
    update media set video = '{"status":"queued"}'::jsonb
    where mime like 'video/%' and not private
      and (video is null or video ->> 'status' in ('queued', 'working') or video ->> 'error' in ('ffmpeg fehlt auf dem Server', 'ausgeschaltet'))
    returning id`;
  if (rows.length) void kickVideoQueue();
  return rows.length;
}
