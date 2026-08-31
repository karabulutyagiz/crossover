// ÇÖZ KAZAN "harf alma" duman testi: çalışan :8123 sunucusuna bağlan, bota karşı
// solo maç kur, İLK turda TÜM harfleri elmas karşılığı aç, birleştir, gönder → çöz.
// Elmas düşümünü ve doğru-harf-doğru-poziyon akışını doğrular.
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';

const URL = process.env.WS_URL ?? 'ws://127.0.0.1:8123';
const userId = randomUUID();
const START_DIAMONDS = 500;

function log(m: string) { console.log(m); }

async function main() {
  await pool.query(`INSERT INTO users (id, display_name, diamonds, social_pack_until) VALUES ($1, 'HintSmoke', $2, now() + interval '1 day')`, [userId, START_DIAMONDS]); // cozkazan paket ister
  const ws = new WebSocket(URL);
  let wordLens: number[] = [];
  const revealed: Record<number, string> = {};
  let total = 0, lastDiamonds = START_DIAMONDS, solved = false, done = false;
  let curRound = 0;

  const finish = (ok: boolean, why: string) => {
    if (done) return; done = true;
    log(`\n${ok ? 'GEÇTİ ✓' : 'KALDI ✗'} — ${why}`);
    try { ws.close(); } catch { /* */ }
    pool.query(`DELETE FROM diamond_ledger WHERE user_id=$1`, [userId]).catch(() => {})
      .then(() => pool.query(`DELETE FROM match_history WHERE user_id=$1`, [userId]).catch(() => {}))
      .then(() => pool.query(`DELETE FROM users WHERE id=$1`, [userId]))
      .then(() => pool.end())
      .then(() => process.exit(ok ? 0 : 1));
  };

  const assembleAndSubmit = () => {
    // revealed[pos] → düz harf dizisi; scrambled kelime uzunluklarıyla böl
    let idx = 0; const words: string[] = [];
    for (const wlen of wordLens) { let w = ''; for (let j = 0; j < wlen; j++) { w += revealed[idx] ?? '?'; idx++; } words.push(w); }
    const answer = words.join(' ');
    log(`  tüm harfler açıldı → cevap birleşti: "${answer}" (harcanan elmas: ${START_DIAMONDS - lastDiamonds})`);
    ws.send(JSON.stringify({ type: 'cozkazan_submit', text: answer }));
  };

  const timer = setTimeout(() => finish(false, 'zaman aşımı'), 60_000);

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'register', name: 'HintSmoke', userId }));
    ws.send(JSON.stringify({ type: 'create_solo', name: 'HintSmoke', userId, options: { mode: 'cozkazan', difficulty: 'easy' } }));
    setTimeout(() => ws.send(JSON.stringify({ type: 'start' })), 1200);
  });

  ws.on('message', (buf) => {
    let msg: any; try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (msg.type === 'cozkazan_state' && !msg.reveal && !solved) {
      if (msg.round !== curRound) {
        // İlk race turu: kutuları kur, ilk harfi iste
        curRound = msg.round;
        wordLens = (msg.scrambled ?? []).map((w: string) => [...w].length);
        total = wordLens.reduce((a: number, b: number) => a + b, 0);
        log(`tur ${msg.round}: [${(msg.scrambled ?? []).join(' ')}] (${total} harf) — harfleri açıyorum…`);
        ws.send(JSON.stringify({ type: 'cozkazan_hint' }));
      }
    }
    if (msg.type === 'cozkazan_hint_result') {
      revealed[msg.position] = msg.letter;
      if (msg.diamonds !== lastDiamonds - 5) log(`  ⚠ elmas beklenmedik: ${lastDiamonds} → ${msg.diamonds}`);
      lastDiamonds = msg.diamonds;
      log(`  harf #${msg.position} = '${msg.letter}'  (elmas: ${msg.diamonds})`);
      const count = Object.keys(revealed).length;
      if (count < total) ws.send(JSON.stringify({ type: 'cozkazan_hint' }));
      else assembleAndSubmit();
    }
    if (msg.type === 'cozkazan_hint_error') { finish(false, `hint_error: ${msg.reason}`); }
    if (msg.type === 'cozkazan_state' && msg.reveal && !solved) {
      solved = true;
      clearTimeout(timer);
      const me = msg.reveal.solvedById && msg.scores.find((s: any) => s.id === msg.reveal.solvedById);
      const okDiamonds = lastDiamonds === START_DIAMONDS - 5 * total;
      log(`  REVEAL: '${msg.reveal.answer}' çözen=${msg.reveal.solvedByName ?? '(kimse)'} | elmas doğru düştü mü: ${okDiamonds}`);
      finish(!!msg.reveal.solvedById && okDiamonds, msg.reveal.solvedById ? 'harflerle çözüldü + elmas düştü' : 'çözülemedi');
    }
  });
  ws.on('error', (e) => finish(false, `ws error: ${e}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
