// "Ben Kimim?" canlı WS duman testi: ÇALIŞAN :8123 sunucusuna bağlan, bota karşı
// solo guess-who maçı kur, havuz+durum akışını doğrula, sırayla tahmin yolla,
// karşılaştırma satırlarının yapısını ve maç sonu (reveal) akışını kanıtla.
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:8123';
const userId = randomUUID();

function log(m: string) { console.log(m); }

async function main() {
  await pool.query(
    `INSERT INTO users (id, display_name, social_pack_until) VALUES ($1, 'GwSmoke', now() + interval '1 day')`,
    [userId],
  );
  const ws = new WebSocket(URL);
  let pool_: { id: number; name: string }[] = [];
  let states = 0, guessesSent = 0, rowsSeen = 0, over = false, revealed = false, denied = 0;
  let structureOk = false;
  const guessed = new Set<number>();
  let youId = '';

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('zaman aşımı: guesswho_over gelmedi')), 180_000);
    let started = false;
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'register', name: 'GwSmoke', userId }));
      ws.send(JSON.stringify({ type: 'create_solo', userId, name: 'GwSmoke', options: { mode: 'guess-who', difficulty: 'easy' } }));
      // create_solo async kurulumu bitince host 'start' yollar (oda + bot hazır).
      setTimeout(() => { if (!started) { started = true; ws.send(JSON.stringify({ type: 'start' })); log('→ start gönderildi'); } }, 1300);
    });
    ws.on('message', (buf) => {
      let msg: any; try { msg = JSON.parse(String(buf)); } catch { return; }
      if (msg.type === 'room_status' && msg.youId) youId = msg.youId;
      if (msg.type === 'state' && msg.room?.youId) youId = msg.room.youId;
      if (msg.type === 'guesswho_pool') { pool_ = msg.players; log(`havuz alındı: ${pool_.length} oyuncu`); }
      if (msg.type === 'guesswho_denied') { denied++; }
      if (msg.type === 'guesswho_state') {
        states++;
        rowsSeen = msg.guesses.length;
        // Yapı doğrulaması: en az bir satır geldiyse alanları kontrol et
        const r = msg.guesses[msg.guesses.length - 1];
        if (r && typeof r.correct === 'boolean' && r.club && typeof r.club.match === 'boolean'
            && r.nationality && r.age && r.jersey && r.position && r.league) structureOk = true;
        if (msg.over) {
          over = true;
          revealed = !!msg.reveal && typeof msg.reveal.name === 'string';
          log(`OVER — winnerId=${msg.winnerId ?? 'null(berabere)'} reveal=${msg.reveal?.name ?? '?'} (${msg.reveal?.clubName ?? '?'} #${msg.reveal?.jersey ?? '?'}, ${msg.reveal?.age ?? '?'} yaş) tahmin=${msg.guesses.length}`);
          clearTimeout(timer); resolve(); return;
        }
        // Sıra bendeyse rastgele bir havuz oyuncusu tahmin et
        const my = msg.turnId && youId && msg.turnId === youId;
        if (my && pool_.length) {
          const cand = pool_.filter((p) => !guessed.has(p.id));
          const pick = cand[Math.floor(Math.random() * cand.length)];
          if (pick) {
            guessed.add(pick.id); guessesSent++;
            ws.send(JSON.stringify({ type: 'guesswho_submit', playerId: pick.id }));
          }
        }
      }
    });
    ws.on('error', reject);
    ws.on('close', () => { if (!over) reject(new Error('soket kapandı, over yok')); });
  });

  try { await done; } finally { ws.close(); }
  log(`\n── SONUÇ ──`);
  log(`havuz: ${pool_.length} · state: ${states} · gönderilen tahmin: ${guessesSent} · görülen satır: ${rowsSeen} · denied: ${denied}`);
  log(`  havuz geldi: ${pool_.length > 0 ? '✅' : '❌'}`);
  log(`  tahmin satırı yapısı doğru (yeşil/kırmızı/ok alanları): ${structureOk ? '✅' : '❌'}`);
  log(`  maç bitti + hedef reveal edildi: ${over && revealed ? '✅' : '❌'}`);
  await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
  await pool.end();
  if (!(pool_.length > 0 && structureOk && over && revealed)) { console.error('❌ DOĞRULAMA BAŞARISIZ'); process.exit(1); }
  log('\n✅ TÜM DOĞRULAMALAR GEÇTİ');
}

main().catch(async (e) => { console.error('❌', e); await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {}); await pool.end(); process.exit(1); });
