// "Ben Kimim?" bot tümdengelim duman testi (gerçek DB): rastgele hedef + rastgele
// tahmin dizisi için kısıtları compareToTarget'la AYNI mantıkla türetip doğrular:
//  1) Sıfır ipucuyla hedef aday DEĞİL (kör bilme imkânsız),
//  2) Her ipucu sonrası hedef aday kümesinde KALIR (kısıtlar hedef için hep doğru),
//  3) Aday kümesi ipuçlarıyla monoton DARALIR (tümdengelim çalışıyor).
import { pool } from '../db/pool.ts';
import { getCard, posGroup, deduceGuessWhoCandidates, type GwDeduction, type GuessWhoCard } from '../game/guessWho.ts';

function addClue(d: GwDeduction, c: GuessWhoCard, t: GuessWhoCard): void {
  d.excludeIds.push(c.playerId);
  if (c.clubId != null && t.clubId != null) { if (c.clubId === t.clubId) d.clubEq = c.clubId; else d.clubNe.push(c.clubId); }
  if (c.nationality) { if (c.nationality === t.nationality) d.natEq = c.nationality; else d.natNe.push(c.nationality); }
  if (c.league) { if (c.league === t.league) d.leagueEq = c.league; else d.leagueNe.push(c.league); }
  const gGrp = posGroup(c.position); const tGrp = posGroup(t.position);
  if (gGrp) { if (gGrp === tGrp) d.posGroupEq = gGrp; else if (!d.posGroupNe.includes(gGrp)) d.posGroupNe.push(gGrp); }
  if (c.age != null && t.age != null) {
    if (c.age === t.age) d.ageEq = c.age;
    else if (t.age > c.age) d.ageMin = Math.max(d.ageMin ?? c.age + 1, c.age + 1);
    else d.ageMax = Math.min(d.ageMax ?? c.age - 1, c.age - 1);
  }
  if (c.jersey != null && t.jersey != null) {
    if (c.jersey === t.jersey) d.jerseyEq = c.jersey;
    else if (t.jersey > c.jersey) d.jerseyMin = Math.max(d.jerseyMin ?? c.jersey + 1, c.jersey + 1);
    else d.jerseyMax = Math.min(d.jerseyMax ?? c.jersey - 1, c.jersey - 1);
  }
}

async function main() {
  const ids = (await pool.query(
    `SELECT g.player_id AS id FROM guess_who_pool g JOIN players p ON p.id=g.player_id
      WHERE p.image_url IS NOT NULL AND g.current_club_id IS NOT NULL AND g.birth_date IS NOT NULL
        AND g.position IS NOT NULL AND p.fame >= 60 ORDER BY random() LIMIT 8`,
  )).rows.map((r: any) => Number(r.id));
  const target = await getCard(ids[0]!);
  if (!target) throw new Error('hedef kartı yok');
  console.log(`HEDEF: ${target.name} (${target.clubName} #${target.jersey}, ${target.age} yaş, ${target.position}, ${target.league})`);

  // 1) sıfır ipucu — hedef hariç
  const d: GwDeduction = { excludeIds: [target.playerId], clubNe: [], natNe: [], leagueNe: [], posGroupNe: [] };
  const blind = await deduceGuessWhoCandidates(d, 5000);
  const blindHasTarget = blind.some((c) => c.playerId === target.playerId);
  console.log(`\n[1] kör küme: ${blind.length} aday, hedef içinde mi: ${blindHasTarget ? '❌ EVET (HATA)' : '✅ HAYIR'}`);

  // 2+3) ipuçları biriktikçe hedef kümede kalmalı + küme daralmalı
  d.excludeIds = [];
  let prev = Infinity; let ok = true;
  for (let i = 1; i < ids.length; i++) {
    const guess = await getCard(ids[i]!);
    if (!guess) continue;
    addClue(d, guess, target);
    const cands = await deduceGuessWhoCandidates(d, 5000);
    const hasTarget = cands.some((c) => c.playerId === target.playerId);
    const shrunk = cands.length <= prev;
    if (!hasTarget || !shrunk) ok = false;
    console.log(`[${i + 1}] tahmin=${guess.name.padEnd(24)} → aday=${String(cands.length).padStart(4)} (önce ${prev === Infinity ? '∞' : prev}) hedef-içinde=${hasTarget ? '✅' : '❌'} daraldı=${shrunk ? '✅' : '❌'}`);
    prev = cands.length;
  }

  console.log(`\n${!blindHasTarget && ok ? '✅ TÜM DOĞRULAMALAR GEÇTİ — tümdengelim tutarlı' : '❌ DOĞRULAMA BAŞARISIZ'}`);
  await pool.end();
  if (blindHasTarget || !ok) process.exit(1);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
