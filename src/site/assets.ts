import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Client scripts (site runtime, editor bridge) are built by scripts/build.mjs
 * into dist/public. In development they're compiled on demand with esbuild.
 */
const DIST = join(process.cwd(), 'dist', 'public');
const SOURCES: Record<string, string> = {
  site: 'src/site/runtime/site.ts',
  bridge: 'src/site/runtime/bridge.ts',
};

const cache = new Map<string, { code: string; hash: string }>();
const dev = process.env.NODE_ENV !== 'production';

async function devBuild(name: string): Promise<string> {
  const esbuild = await import('esbuild');
  const r = await esbuild.build({ entryPoints: [SOURCES[name]], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
  return r.outputFiles[0].text;
}

export async function runtimeScript(name: 'site' | 'bridge'): Promise<{ code: string; hash: string }> {
  if (!dev && cache.has(name)) return cache.get(name)!;
  let code: string;
  const file = join(DIST, `${name}.js`);
  if (!dev && existsSync(file)) code = readFileSync(file, 'utf8');
  else code = await devBuild(name);
  const entry = { code, hash: createHash('sha1').update(code).digest('hex').slice(0, 10) };
  cache.set(name, entry);
  return entry;
}

export function runtimeVersion(name: 'site' | 'bridge'): string {
  return cache.get(name)?.hash ?? 'dev';
}
