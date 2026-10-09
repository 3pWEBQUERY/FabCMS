// Production build: admin SPA (Vite), server bundle and the two client scripts (esbuild).
import { build as vite } from 'vite';
import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';

const t0 = Date.now();
await rm('dist', { recursive: true, force: true });
await mkdir('dist/public', { recursive: true });

await vite({ configFile: 'vite.config.ts', logLevel: 'warn' });

await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning',
});

for (const name of ['site', 'bridge', 'fields']) {
  await build({
    entryPoints: [`src/site/runtime/${name}.ts`],
    outfile: `dist/public/${name}.js`,
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    logLevel: 'warning',
  });
}

// CLI: one file without dependencies, served at /api/v1/cli.mjs.
await build({
  entryPoints: ['src/cli/nova.ts'],
  outfile: 'dist/public/nova.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});

console.log(`Build fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
