// End-to-end test for the SECOND wave of Seviye Yolu powers (Seviye Yolu güçleri):
//   training (Antrenman Bileti, seviye 35): kullanıldığı gün bot XP günlük tavanını kaldırır
//   socialtoken (Sosyal Paket Jetonu, seviye 45): Sosyal Paket süresine +24 saat ekler
// Doğrulanan akış: claim (level 35 → training, level 45 → socialtoken) → use (atomic,
// double-use blocked) → bot maçı kazanılır ve günlük 60 XP tavanı training aktifken
// delinmemiş görünür (gained tam 15, tavana takılmaz) → socialtoken kullanımı Sosyal
// Paket süresini +24 saat uzatır → mağazadan her iki güç de elmasla satın alınabilir.
// Needs a running server (WS_URL) + direct DB access (DATABASE_URL) to seed state.
// Usage: WS_URL=ws://localhost:8084 npx tsx src/cli/powers2test.ts
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';
import { pool, closePool } from '../db/pool.ts';
import { commonPlayersDetailed } from '../game/verify.ts';
import { BOT_POOLS } from '../game/botpools.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';

class Client {
  private ws: WebSocket;
  private buf: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private opened: Promise<void>;
  constructor(private tag: string) {
    this.ws = new WebSocket(URL);
    this.opened = new Promise((res, rej) => {
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
    });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(m);
      else this.buf.push(m);
    });
  }
  open() { return this.opened; }
  send(msg: ClientMsg) { this.ws.send(JSON.stringify(msg)); }
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 25_000): Promise<Extract<ServerMsg, { type: T }>> {
    const pred = (m: ServerMsg) => m.type === type;
    const hit = this.buf.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0] as Extract<ServerMsg, { type: T }>);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`[${this.tag}] timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); res(m as Extract<ServerMsg, { type: T }>); } });
    });
  }
  // Predicate-based wait (for "either A or B" races, e.g. guess_phase vs an early skip result).
  waitAny(pred: (m: ServerMsg) => boolean, timeoutMs = 25_000): Promise<ServerMsg> {
    const hit = this.buf.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0]!);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`[${this.tag}] timeout waiting for predicate`)), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); res(m); } });
    });
  }
  close() { this.ws.close(); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = false;
function check(cond: boolean, label: string) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failed = true;
}

// ---- Bot maçı yardımcıları ----
// Bot, kendi zorluk havuzundan İNSANIN seçtiği takımla ORTAK OYUNCUSU olan bir takımı
// TERCİH EDER (botPickFromPool, verify.ts) — bu yüzden insan tarafının, botun 'medium'
// havuzuyla kesişimi kanıtlanmış (DB'den doğrulanmış) ünlü kulüpler seçmesi, her round'un
// gerçek bir eşleşmeyle (skip değil) sonuçlanmasını neredeyse garanti eder.
async function resolveClubId(nameLike: string): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id FROM clubs c
      WHERE c.is_national = FALSE AND c.name ILIKE $1
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
      ORDER BY length(c.name) ASC LIMIT 1`,
    [`%${nameLike}%`],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function crossoverCount(clubId: number, otherIds: number[]): Promise<number> {
  if (!otherIds.length) return 0;
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT count(DISTINCT pc2.club_id) AS cnt FROM player_clubs pc1
       JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id
      WHERE pc1.club_id = $1 AND pc2.club_id = ANY($2::bigint[])`,
    [clubId, otherIds],
  );
  return Number(rows[0]?.cnt ?? 0);
}

const FAMOUS_CLUB_NAMES = [
  'Real Madrid', 'FC Barcelona', 'Manchester United', 'Manchester City', 'Liverpool',
  'Arsenal', 'Chelsea', 'Bayern Munchen', 'Borussia Dortmund', 'Juventus', 'Inter',
  'AC Milan', 'Napoli', 'Galatasaray', 'Fenerbahce', 'Besiktas', 'Ajax', 'Benfica',
  'FC Porto', 'Paris Saint Germain', 'Atletico de Madrid', 'Tottenham',
];

// İnsan tarafının maç boyu kullanacağı aday kulüpler: botun 'medium' havuzuyla en
// yüksek kesişime sahip olanlar önce gelecek şekilde sıralanır.
async function buildHumanCandidates(): Promise<number[]> {
  const mediumIds: number[] = [];
  for (const t of BOT_POOLS.medium) {
    const id = await resolveClubId(t.q);
    if (id) mediumIds.push(id);
  }
  const scored: { id: number; score: number }[] = [];
  for (const name of FAMOUS_CLUB_NAMES) {
    const id = await resolveClubId(name);
    if (!id) continue;
    const score = await crossoverCount(id, mediumIds);
    if (score > 0) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

// Bir round oyna: pick_phase → taze bir aday kulüple pick_team → reveal_teams'ten
// ortak oyuncu ADINI DB'den al → guess_phase gelirse doğru cevabı hemen gönder
// (medium bot 4-9sn gecikmeli cevaplıyor, bize bolca zaman bırakır). Round ortak
// oyuncu bulunamayıp atlanırsa (result, matchOver muhtemelen false) direkt döndür.
async function playSoloRound(
  A: Client,
  candidates: number[],
  used: Set<number>,
): Promise<Extract<ServerMsg, { type: 'result' }>> {
  const pp = await A.wait('pick_phase');
  for (const id of pp.usedClubIds ?? []) used.add(id);
  const clubId = candidates.find((id) => !used.has(id));
  if (clubId === undefined) throw new Error('playSoloRound: taze aday kulüp kalmadı');
  used.add(clubId);
  A.send({ type: 'pick_team', clubId });
  const reveal = await A.wait('reveal_teams');
  const common = await commonPlayersDetailed(reveal.teamA.id, reveal.teamB.id, 1);
  const next = await A.waitAny((m) => m.type === 'guess_phase' || m.type === 'result');
  if (next.type === 'guess_phase') {
    A.send({ type: 'submit_guess', text: common[0]?.name ?? 'zzz-no-common-player' });
    return A.wait('result');
  }
  return next as Extract<ServerMsg, { type: 'result' }>;
}

// WIN_TARGET = 3 (room.ts): insan doğru cevaplarla 3 round kazanana kadar oynar.
// Skip'ler (ortak oyuncu bulunamadı / aynı takım) sayılmaz, sadece bir sonraki
// round'a geçilir — bu yüzden cömert bir deneme tavanı bırakıyoruz.
async function playSoloMatch(A: Client, candidates: number[]): Promise<Extract<ServerMsg, { type: 'result' }>> {
  const used = new Set<number>();
  let last: Extract<ServerMsg, { type: 'result' }> | null = null;
  for (let i = 0; i < 25; i++) {
    last = await playSoloRound(A, candidates, used);
    if (last.matchOver) return last;
    await A.wait('waiting_ready');
    A.send({ type: 'ready' }); // bot da 'ready' basıyor (bot.ts) — ikisi de hazır olunca round hemen başlar
    await A.wait('countdown');
  }
  throw new Error('playSoloMatch: 25 round içinde bitmedi (matchOver hiç gelmedi)');
}

async function main() {
  console.log(`Probing ${URL}`);
  const A = new Client('A');
  await A.open();

  A.send({ type: 'guest' });
  const prof = (await A.wait('profile')).profile;
  const userId = prof.userId;

  // ---- SEED: seviye 45, envanterde 2'şer training/socialtoken, bol elmas, bot XP
  // tavanına 5 kalmış (bot_xp_today=55, tavan 60) ----
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `UPDATE users SET level = 45, power_training = 2, power_socialtoken = 2,
       diamonds = 2000, bot_xp_day = $2, bot_xp_today = 55
     WHERE id = $1`,
    [userId, today],
  );

  // ---- CLAIM: level 35 → training, level 45 → socialtoken ----
  A.send({ type: 'claim_level_reward', level: 35 });
  const c35 = await A.wait('level_reward_claimed');
  check(c35.powerId === 'training' && c35.diamonds === 50, `level 35 claim grants training +50💎 — got ${c35.powerId}/${c35.diamonds}`);
  const trainingAfterClaim = c35.profile.powerTraining ?? -1;
  check(trainingAfterClaim === 3, `inventory training = 3 (2 seed + 1 claim) — got ${trainingAfterClaim}`);

  A.send({ type: 'claim_level_reward', level: 45 });
  const c45 = await A.wait('level_reward_claimed');
  check(c45.powerId === 'socialtoken' && c45.diamonds === 50, `level 45 claim grants socialtoken +50💎 — got ${c45.powerId}/${c45.diamonds}`);
  const socialtokenAfterClaim = c45.profile.powerSocialToken ?? -1;
  check(socialtokenAfterClaim === 3, `inventory socialtoken = 3 (2 seed + 1 claim) — got ${socialtokenAfterClaim}`);

  // ---- USE: training ----
  A.send({ type: 'use_power', powerId: 'training' });
  const u1 = await A.wait('power_used');
  const tUntilMs = u1.profile.trainingBoostUntil ? new Date(u1.profile.trainingBoostUntil).getTime() - Date.now() : 0;
  check(u1.powerId === 'training' && tUntilMs > 50 * 60_000 && tUntilMs < 70 * 60_000, `training used — ~1 saat pencere, kalan ${(tUntilMs/60000).toFixed(1)} dk`);
  check((u1.profile.powerTraining ?? -1) === trainingAfterClaim - 1, `inventory training back to ${trainingAfterClaim - 1} — got ${u1.profile.powerTraining}`);

  A.send({ type: 'use_power', powerId: 'training' });
  const e1 = await A.wait('error');
  check(/zaten aktif/i.test(e1.message), `second training while active blocked — "${e1.message}"`);

  // ---- BOT MAÇI: 3 round kazan, xp_update'te tavan delinmiş (gained tam 15) ----
  const candidates = await buildHumanCandidates();
  check(candidates.length >= 3, `insan adayı kulüp listesi yeterince zengin — ${candidates.length} aday`);

  A.send({ type: 'create_solo', name: 'P2T', userId, options: { mode: 'team-team', difficulty: 'medium' } });
  await A.wait('room_state');
  A.send({ type: 'start' });
  const matchResult = await playSoloMatch(A, candidates);
  check(matchResult.matchOver === true, 'solo bot match ended (matchOver)');
  // create_solo, kayıtlı profilin displayName'ini kullanır (msg.name yalnız profil
  // yokken devreye girer) — bu yüzden kazananın adı guest kullanıcı adıyla eşleşmeli.
  check(matchResult.winnerName === prof.displayName, `human (${prof.displayName}) won the bot match — winner was "${matchResult.winnerName}"`);
  const xpWin = await A.wait('xp_update');
  check(xpWin.gained === 15, `bot win XP = 15, daily cap bypassed by training boost — got ${xpWin.gained}`);

  // ---- USE: socialtoken ----
  A.send({ type: 'use_power', powerId: 'socialtoken' });
  const u2 = await A.wait('power_used');
  check((u2.profile.powerSocialToken ?? -1) === socialtokenAfterClaim - 1, `inventory socialtoken back to ${socialtokenAfterClaim - 1} — got ${u2.profile.powerSocialToken}`);
  const untilMs = u2.profile.socialPackUntil ? new Date(u2.profile.socialPackUntil).getTime() : 0;
  const expectedMs = Date.now() + 24 * 60 * 60 * 1000;
  const driftMs = Math.abs(untilMs - expectedMs);
  check(driftMs <= 5 * 60 * 1000, `socialPackUntil ≈ now+24h (drift ${Math.round(driftMs / 1000)}s) — got ${u2.profile.socialPackUntil}`);

  // ---- MAĞAZADAN SATIN ALMA ----
  A.send({ type: 'buy_power', powerId: 'training' });
  const pb1 = await A.wait('power_purchased');
  check(pb1.powerId === 'training' && pb1.profile.diamonds === u2.profile.diamonds - 250, `store buy training → -250💎, kalan ${pb1.profile.diamonds}`);
  check((pb1.profile.powerTraining ?? -1) === (u1.profile.powerTraining ?? 0) + 1, `inventory training +1 after purchase — got ${pb1.profile.powerTraining}`);

  A.send({ type: 'buy_power', powerId: 'socialtoken' });
  const pb2 = await A.wait('power_purchased');
  check(pb2.powerId === 'socialtoken' && pb2.profile.diamonds === pb1.profile.diamonds - 350, `store buy socialtoken → -350💎, kalan ${pb2.profile.diamonds}`);
  check((pb2.profile.powerSocialToken ?? -1) === (u2.profile.powerSocialToken ?? 0) + 1, `inventory socialtoken +1 after purchase — got ${pb2.profile.powerSocialToken}`);

  A.close();
  await sleep(200);
  await closePool();
  console.log(failed ? '\n❌ POWERS2TEST FAILED' : '\n✅ POWERS2TEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('powers2test error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
