#!/usr/bin/env node
/**
 * Builds and signs an own extension catalogue for Nova's Marktplatz.
 *
 *   node scripts/extensions-catalogue.mjs keygen
 *     → private key (keep it secret) and the public key for NOVA_EXTENSIONS_KEY
 *   node scripts/extensions-catalogue.mjs sign <folder with *.json manifests> <private-key.pem> > catalogue.json
 *     → upload catalogue.json anywhere (HTTPS) and set NOVA_EXTENSIONS_URL to its address
 *
 * Nova shows the catalogue only when the Ed25519 signature over the
 * «extensions» text matches the public key, and checks each manifest itself.
 */
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [cmd, dir, keyFile] = process.argv.slice(2);
if (cmd === 'keygen') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  console.log(privateKey.export({ type: 'pkcs8', format: 'pem' }).trim());
  console.log(`\nNOVA_EXTENSIONS_KEY=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`);
} else if (cmd === 'sign' && dir && keyFile) {
  const manifests = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const extensions = JSON.stringify(manifests);
  const signature = sign(null, Buffer.from(extensions), createPrivateKey(readFileSync(keyFile))).toString('base64');
  process.stdout.write(JSON.stringify({ extensions, signature }) + '\n');
  console.error(`${manifests.length} Erweiterungen signiert.`);
} else {
  console.error('Aufruf: extensions-catalogue.mjs keygen | sign <Ordner> <privater-schlüssel.pem>');
  process.exit(1);
}
