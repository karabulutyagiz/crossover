// ÇÖZ KAZAN canlı WS duman testi: ÇALIŞAN :8123 sunucusuna gerçek soketle bağlan,
// bota karşı solo cozkazan maçı kur, ilk tur state'ini + reveal/over akışını doğrula.
// (Bot cevapları çözer; biz sadece sunucunun modu uçtan uca sürdüğünü kanıtlıyoruz.)
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:8123';
const userId = randomUUID();

function log(m: string) { console.log(m); }

async function main() {
  await pool.query(`INSERT INTO users (id, display_name) VALUES ($1, 'CozLiveSmoke')`, [userId]);
  const ws = new WebSocket(URL);
  let rounds = 0, reveals = 0, over = false, gotState = false;
  const seenRounds = new Set<number>();

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('zaman aşımı: cozkazan_over gelmedi')), 210_000);
    let started = false;
    const startOnce = () => { if (!started) { started = true; ws.send(JSON.stringify({ type: 'start' })); log('  → start gönderildi'); } };
    ws.on('open', () => {
      log(`bağlandı ${URL}`);
      ws.send(JSON.stringify({ type: 'register', name: 'CozLiveSmoke', userId }));
      ws.send(JSON.stringify({ type: 'create_solo', name: 'CozLiveSmoke', userId, options: { mode: 'cozkazan', difficulty: 'medium' } }));
      // create_solo async kurulumu bitince host 'start' yollar (oda + bot hazır).
      setTimeout(startOnce, 1200);
    });
    ws.on('message', (buf) => {
      let msg: any; try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (msg.type === 'error') { log(`  ⚠ error: ${msg.message}`); }
      if (msg.type === 'cozkazan_state') {
        gotState = true;
        if (!seenRounds.has(msg.round)) {
          seenRounds.add(msg.round);
          rounds = Math.max(rounds, msg.round);
          const words = (msg.scrambled ?? []).join(' ');
          log(`  tur ${msg.round}/${msg.totalRounds} [${words}]`);
        }
        if (msg.reveal) { reveals++; }
      }
      if (msg.type === 'cozkazan_over') {
        over = true;
        const sc = (msg.scores ?? []).map((s: any) => `${s.name}:${s.score}`).join(' ');
        log(`\n=== OVER kazanan=${msg.winnerName ?? '(yok)'} sebep=${msg.reason} | ${sc} ===`);
        clearTimeout(timer);
        resolve();
      }
    });
    ws.on('error', reject);
    ws.on('close', () => { if (!over) reject(new Error('soket over gelmeden kapandı')); });
  });

  let ok = true;
  try {
    await done;
  } catch (e) {
    ok = false;
    log(`HATA: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try { ws.close(); } catch { /* */ }
    await pool.query(`DELETE FROM match_history WHERE user_id=$1`, [userId]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);
  }
  ok = ok && gotState && rounds >= 1 && reveals >= 1 && over;
  log(`\ntur=${rounds} reveal>=1:${reveals >= 1} over:${over} | ${ok ? 'GEÇTİ ✓' : 'KALDI ✗'}`);
  await pool.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
