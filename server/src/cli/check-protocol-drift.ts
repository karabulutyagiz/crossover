import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const serverProtocol = resolve(root, 'server/src/protocol.ts');
const appProtocol = resolve(root, 'app/src/protocol.ts');

function block(src: string, typeName: 'ClientMsg' | 'ServerMsg'): string {
  const start = src.indexOf(`export type ${typeName} =`);
  if (start < 0) throw new Error(`Missing ${typeName}`);
  const next = src.indexOf(`export type ${typeName === 'ClientMsg' ? 'ServerMsg' : 'Never'} =`, start + 1);
  if (next >= 0) return src.slice(start, next);
  const interfaceStart = src.indexOf('\nexport interface ', start + 1);
  return interfaceStart >= 0 ? src.slice(start, interfaceStart) : src.slice(start);
}

function messageTypes(src: string, typeName: 'ClientMsg' | 'ServerMsg'): string[] {
  return [...block(src, typeName).matchAll(/type:\s*'([^']+)'/g)]
    .map((m) => m[1]!)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();
}

function diff(a: string[], b: string[]): string[] {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

async function main(): Promise<void> {
  const [serverSrc, appSrc] = await Promise.all([
    readFile(serverProtocol, 'utf8'),
    readFile(appProtocol, 'utf8'),
  ]);
  let failed = false;
  for (const typeName of ['ClientMsg', 'ServerMsg'] as const) {
    const serverTypes = messageTypes(serverSrc, typeName);
    const appTypes = messageTypes(appSrc, typeName);
    const serverOnly = diff(serverTypes, appTypes);
    const appOnly = diff(appTypes, serverTypes);
    if (serverOnly.length || appOnly.length) {
      failed = true;
      console.error(`Protocol drift in ${typeName}:`);
      if (serverOnly.length) console.error(`  server only: ${serverOnly.join(', ')}`);
      if (appOnly.length) console.error(`  app only: ${appOnly.join(', ')}`);
    }
  }
  if (failed) process.exitCode = 1;
  else console.log('✓ Protocol message types match.');
}

main().catch((err) => {
  console.error('Protocol drift check failed:', err);
  process.exitCode = 1;
});
