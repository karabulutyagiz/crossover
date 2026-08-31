// Mevcut kullanıcı adlarını GÜNCEL süzgeçten geçirir (yalnız rapor, DB'ye dokunmaz).
// Kullanım: npx tsx src/cli/scan-existing-names.ts <isim-dosyasi>
import { readFileSync } from 'node:fs';
import { validateUsername } from '../game/username.ts';

const path = process.argv[2];
if (!path) { console.error('isim dosyası ver'); process.exit(1); }
const names = readFileSync(path, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const bad: { name: string; reason: string }[] = [];
for (const n of names) {
  const r = validateUsername(n);
  if (!r.ok) bad.push({ name: n, reason: r.error ?? '?' });
}
const profanity = bad.filter((b) => b.reason.includes('uygun değil'));
const other = bad.filter((b) => !b.reason.includes('uygun değil'));
console.log(`taranan: ${names.length}`);
console.log(`UYGUNSUZ (küfür/argo): ${profanity.length}`);
for (const b of profanity) console.log(`  ✗ ${b.name}`);
console.log(`biçim kuralına takılan (eski adlar, dokunulmayabilir): ${other.length}`);
const byReason = new Map<string, number>();
for (const b of other) byReason.set(b.reason, (byReason.get(b.reason) ?? 0) + 1);
for (const [r, c] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${c.toString().padStart(4)} × ${r}`);
