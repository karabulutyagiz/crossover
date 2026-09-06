// "Ben Kimim?" ÇOK TURLU canlı WS duman testi (2026-09-06): ÇALIŞAN :8123 sunucusuna
// 'gwrounds' yeteneğiyle bağlan, bota karşı solo maç kur; (1) havuz DIŞI bir oyuncuyu
// tahmin et → satır gelmeli (not_pool YOK), (2) turlar kapanıp yeni hedefle devam
// etmeli (roundOver + scores + target=3), (3) biri 3 turu alınca over=true.
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:8123';
const NONPOOL_ID = Number(process.env.GW_NONPOOL_ID ?? '9000013');
const userId = randomUUID();
await pool.query(`INSERT INTO users (id, display_name, social_pack_until) VALUES ($1, 'GwRounds', now() + interval '1 day')`, [userId]);

const ws = new WebSocket(URL);
const send = (m: unknown) => ws.send(JSON.stringify(m));
let youId = ''; let poolIds: number[] = []; const guessedThisRound = new Set<number>();
let nonPoolTried = false, nonPoolRow = false, over = false;
let roundOvers = 0; const rounds = new Set<number>(); const targets: string[] = []; const denied: string[] = [];
const fin: { scores: { id: string; score: number }[] | null } = { scores: null }; let sawTarget3 = false;

ws.on('open', () => {
  send({ type: 'register', name: 'GwRounds', userId, caps: ['gwrounds'] });
  send({ type: 'create_solo', userId, name: 'GwRounds', options: { mode: 'guess-who', difficulty: 'easy' }, caps: ['gwrounds'] });
  setTimeout(() => send({ type: 'start' }), 1300);
});
ws.on('message', (buf) => {
  let m: any; try { m = JSON.parse(String(buf)); } catch { return; }
  if (m.type === 'room_state' && m.room?.youId) youId = m.room.youId;
  if (m.type === 'guesswho_pool') poolIds = m.players.map((p: any) => p.id);
  if (m.type === 'guesswho_denied') denied.push(m.reason);
  if (m.type === 'error') console.log('error:', m.message);
  if (m.type !== 'guesswho_state') return;
  if (m.round) rounds.add(m.round);
  if (m.target === 3) sawTarget3 = true;
  for (const r of m.guesses) if (r.playerId === NONPOOL_ID) nonPoolRow = true;
  if (m.roundOver) {
    roundOvers++; targets.push(m.reveal?.name ?? '?');
    console.log(`tur ${m.round} kapandı → ${m.roundWinnerId === youId ? 'BEN' : m.roundWinnerId ? 'BOT' : 'İPTAL'} | skor ${JSON.stringify(m.scores?.map((s: any) => s.score))} | hedef ${m.reveal?.name} | turnId=${m.turnId} blur=${m.blurLevel}`);
    return;
  }
  if (m.over) { over = true; fin.scores = m.scores ?? null; console.log(`MAÇ BİTTİ → ${m.winnerId === youId ? 'BEN' : m.winnerId ? 'BOT' : 'BERABERE'} | skor ${JSON.stringify(m.scores?.map((s: any) => s.score))} | hedef ${m.reveal?.name}`); return; }
  if (m.guesses.length === 0) guessedThisRound.clear(); // yeni tur
  if (m.turnId !== youId) return;
  let pick: number | undefined;
  if (!nonPoolTried) { nonPoolTried = true; pick = NONPOOL_ID; }
  else pick = poolIds.find((id) => !guessedThisRound.has(id) && !m.guesses.some((g: any) => g.playerId === id));
  if (pick == null) return;
  guessedThisRound.add(pick);
  setTimeout(() => send({ type: 'guesswho_submit', playerId: pick }), 250);
});

await new Promise<void>((res, rej) => {
  const t = setTimeout(() => rej(new Error('zaman aşımı (240 sn): maç bitmedi')), 240_000);
  const iv = setInterval(() => { if (over) { clearTimeout(t); clearInterval(iv); res(); } }, 200);
});
const uniqueTargets = new Set(targets).size === targets.length;
const someoneHas3 = !!fin.scores?.some((s) => s.score >= 3);
console.log(`\nSONUÇ: turlar=${[...rounds].sort().join(',')} roundOver=${roundOvers} target3=${sawTarget3} havuzDışıSatır=${nonPoolRow} denied=${denied.join(',') || '-'} hedeflerBenzersiz=${uniqueTargets} 3eUlaşan=${someoneHas3}`);
const ok = rounds.size >= 2 && roundOvers >= 1 && sawTarget3 && nonPoolRow && !denied.includes('not_pool') && uniqueTargets && (someoneHas3 || roundOvers >= 2);
console.log(ok ? 'SMOKE OK' : 'SMOKE HATA');
ws.close(); await pool.end(); process.exit(ok ? 0 : 1);
