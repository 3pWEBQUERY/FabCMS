import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, s3Configured } from './env';

export interface StoredObject {
  body: Readable;
  size: number;
  contentType: string;
}

export interface Storage {
  kind: 's3' | 'local';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  getBuffer(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  list(prefix: string): Promise<{ key: string; size: number }[]>;
  /** Short-lived direct link, used for large downloads so they bypass the service. */
  presign(key: string, seconds: number, filename?: string): Promise<string | null>;
}

function s3Storage(): Storage {
  const client = new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  const Bucket = env.s3.bucket;
  const isMissing = (e: any) => e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;

  return {
    kind: 's3',
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return { body: r.Body as Readable, size: Number(r.ContentLength ?? 0), contentType: r.ContentType ?? 'application/octet-stream' };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async getBuffer(key) {
      const o = await this.get(key);
      if (!o) return null;
      const chunks: Buffer[] = [];
      for await (const c of o.body) chunks.push(Buffer.from(c));
      return Buffer.concat(chunks);
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (e) {
        if (isMissing(e)) return false;
        throw e;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async deletePrefix(prefix) {
      for (const o of await this.list(prefix)) await this.delete(o.key);
    },
    async list(prefix) {
      const out: { key: string; size: number }[] = [];
      let token: string | undefined;
      do {
        const r = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) out.push({ key: o.Key!, size: Number(o.Size ?? 0) });
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out;
    },
    async presign(key, seconds, filename) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: filename ? `attachment; filename="${filename.replace(/"/g, '')}"` : undefined,
        }),
        { expiresIn: seconds },
      );
    },
  };
}

function localStorage(root: string): Storage {
  const base = resolve(root);
  const path = (key: string) => {
    const p = resolve(base, key);
    if (!p.startsWith(base)) throw new Error('Ungültiger Speicherpfad');
    return p;
  };
  const types = new Map<string, string>();
  return {
    kind: 'local',
    async put(key, body, contentType) {
      const p = path(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
      await writeFile(p + '.type', contentType);
      types.set(key, contentType);
    },
    async get(key) {
      try {
        const p = path(key);
        const s = await stat(p);
        const contentType = types.get(key) ?? (await readFile(p + '.type', 'utf8').catch(() => 'application/octet-stream'));
        return { body: createReadStream(p), size: s.size, contentType };
      } catch {
        return null;
      }
    },
    async getBuffer(key) {
      return readFile(path(key)).catch(() => null);
    },
    async exists(key) {
      return stat(path(key)).then(
        () => true,
        () => false,
      );
    },
    async delete(key) {
      await rm(path(key), { force: true });
      await rm(path(key) + '.type', { force: true });
    },
    async deletePrefix(prefix) {
      await rm(path(prefix), { recursive: true, force: true });
    },
    async list(prefix) {
      const out: { key: string; size: number }[] = [];
      const walk = async (dir: string) => {
        const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const it of items) {
          const full = join(dir, it.name);
          if (it.isDirectory()) await walk(full);
          else if (!it.name.endsWith('.type')) out.push({ key: full.slice(base.length + 1), size: (await stat(full)).size });
        }
      };
      await walk(base);
      return out.filter((o) => o.key.startsWith(prefix));
    },
    async presign() {
      return null;
    },
  };
}

export const storage: Storage = s3Configured() ? s3Storage() : localStorage(env.localStorageDir);
