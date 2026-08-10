#!/usr/bin/env node
// data.json'u (≈6MB) app/src/offline/data/ altındaki küçük parçalara böler.
//
// NEDEN: offline/db.ts eskiden data.json'u TEK require ile yüklüyordu — Hermes
// ~98k nesneyi tek kesintisiz blokta kurarken JS thread'i yüzlerce ms kilitleniyordu
// (ilk açılışta, tam kullanıcı giriş dokunuşları sırasında). db.ts artık bu
// parçaları sırayla, aralarda event loop'a dönerek require ediyor; hiçbir blok
// ~100ms'i aşmıyor. Satır İÇERİKLERİ data.json ile bire bir aynıdır.
//
// KULLANIM — veri her yenilendiğinde (server/src/cli/export-offline.ts sonrası):
//   node app/scripts/split-offline-data.mjs
// ve eskisi gibi offline/db.ts içindeki CURRENT_VERSION artırılır.
// db.ts'teki require listesi ile buradaki parça adları/sayıları eşleşmek ZORUNDA.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const offlineDir = path.resolve(__dirname, '..', 'src', 'offline');
const srcPath = path.join(offlineDir, 'data.json');
const outDir = path.join(offlineDir, 'data');

const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// Parça sayıları: en büyük tek parse ~1MB kalsın diye seçildi (players ~17k satır
// → 2 parça, spells ~81k satır → 4 parça). Artırmak güvenlidir; db.ts de güncellenmeli.
const PLAYER_PARTS = 2;
const SPELL_PARTS = 4;

function writeParts(name, rows, parts) {
  const per = Math.ceil(rows.length / parts);
  for (let i = 0; i < parts; i++) {
    const slice = rows.slice(i * per, (i + 1) * per);
    const file = path.join(outDir, `${name}-${i + 1}.json`);
    fs.writeFileSync(file, JSON.stringify(slice));
    console.log(`  ${path.basename(file)}: ${slice.length} rows, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
}

fs.writeFileSync(path.join(outDir, 'clubs.json'), JSON.stringify(data.clubs));
console.log(`  clubs.json: ${data.clubs.length} rows, ${(fs.statSync(path.join(outDir, 'clubs.json')).size / 1024).toFixed(0)} KB`);
writeParts('players', data.players, PLAYER_PARTS);
writeParts('spells', data.spells, SPELL_PARTS);

// Doğrulama: parçaların birleşimi kaynakla bire bir aynı mı?
const cat = (name, parts) => {
  const all = [];
  for (let i = 1; i <= parts; i++) all.push(...JSON.parse(fs.readFileSync(path.join(outDir, `${name}-${i}.json`), 'utf8')));
  return all;
};
const same =
  JSON.stringify(JSON.parse(fs.readFileSync(path.join(outDir, 'clubs.json'), 'utf8'))) === JSON.stringify(data.clubs) &&
  JSON.stringify(cat('players', PLAYER_PARTS)) === JSON.stringify(data.players) &&
  JSON.stringify(cat('spells', SPELL_PARTS)) === JSON.stringify(data.spells);
if (!same) {
  console.error('SPLIT VERIFICATION FAILED — parçalar data.json ile aynı değil!');
  process.exit(1);
}
console.log(`OK — ${data.clubs.length} clubs, ${data.players.length} players, ${data.spells.length} spells; parçalar kaynakla bire bir aynı.`);
