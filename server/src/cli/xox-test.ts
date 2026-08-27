// ============================================================================
// FUTBOL XOX ENTEGRASYON TESTİ — oda-seviyesi kural makinesi + grid üreticisi.
// Gerçek yerel DB kullanır (crossover çifti + doğrulama). Çalıştır:
//   npx tsx src/cli/xox-test.ts
// ============================================================================
import { Room, type Transport } from '../rooms/room.ts';
import type { ServerMsg, ClubRef } from '../protocol.ts';
import { generateXoxGrid, XOX_MIN_CELL_ANSWERS, XOX_TURN_CAP } from '../game/xoxGrid.ts';
import { pool, closePool } from '../db/pool.ts';

process.on('unhandledRejection', (err) => {
  console.log('  (ignored async rejection: ' + (err instanceof Error ? err.message : String(err)) + ')');
});

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Async doğrulama (soğuk sorguda yavaş olabilir): koşulu 3 sn'ye kadar bekle.
async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until && !cond()) await sleep(50);
}

interface FakeTransport extends Transport {
  inbox: ServerMsg[];
  last<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }> | undefined;
  count(type: ServerMsg['type']): number;
}

function fake(): FakeTransport {
  const inbox: ServerMsg[] = [];
  return {
    isBot: false,
    caps: ['xox', 'wrongopen'],
    inbox,
    send: (msg: ServerMsg) => { inbox.push(msg); },
    last: (type) => [...inbox].reverse().find((m) => m.type === type) as never,
    count: (type) => inbox.filter((m) => m.type === type).length,
  };
}

// Gerçek bir crossover: iki kulüp + ikisinde de oynamış futbolcu.
async function realPair(): Promise<{ a: ClubRef; b: ClubRef; player: string }> {
  const { rows } = await pool.query<{ aid: string; an: string; bid: string; bn: string; player_name: string }>(
    `SELECT c1.id AS aid, c1.name AS an, c2.id AS bid, c2.name AS bn, p.name AS player_name
       FROM player_clubs pc1
       JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id AND pc2.club_id <> pc1.club_id
       JOIN players p ON p.id = pc1.player_id
       JOIN clubs c1 ON c1.id = pc1.club_id AND c1.is_national = FALSE
       JOIN clubs c2 ON c2.id = pc2.club_id AND c2.is_national = FALSE
      ORDER BY random() LIMIT 1`,
  );
  const r = rows[0]!;
  return { a: { id: Number(r.aid), name: r.an, logoUrl: null }, b: { id: Number(r.bid), name: r.bn, logoUrl: null }, player: r.player_name };
}

interface Ctx { room: Room; a: FakeTransport; b: FakeTransport; aId: string; bId: string; r: any }

function makeXoxMatch(rows: ClubRef[], cols: ClubRef[], firstTurn: 'a' | 'b' = 'a'): Ctx {
  const room = new Room('XOXT', () => {});
  room.gameMode = 'xox';
  const a = fake();
  const b = fake();
  const resA = room.addPlayer('Ali', a, true);
  const resB = room.addPlayer('Veli', b, false);
  if (!resA.ok || !resB.ok) throw new Error('addPlayer failed');
  const r = room as any;
  r.status = 'xox';
  r.matchOver = false;
  r.matchStartedAt = Date.now();
  r.round = null;
  r.xox = {
    rows, cols,
    cells: Array.from({ length: 9 }, () => ({ owner: null, playerName: null, playerImageUrl: null })),
    counts: Array.from({ length: 9 }, () => 3),
    turnId: firstTurn === 'a' ? resA.id : resB.id,
    turnEndsAt: Date.now() + 20_000,
    turnNumber: 1,
    pending: false,
    suddenDeath: false,
    suddenCell: null,
    suddenFailed: new Set(),
    wrongs: new Map(),
  };
  return { room, a, b, aId: resA.id, bId: resB.id, r };
}

async function main(): Promise<void> {
  // ── Grid üreticisi: 9 hücrenin HEPSİ cevap garantili
  {
    const grid = await generateXoxGrid();
    check(!!grid, 'grid generator produces a grid from live data');
    if (grid) {
      check(grid.rows.length === 3 && grid.cols.length === 3, 'grid has 3 rows + 3 cols');
      const ids = new Set([...grid.rows, ...grid.cols].map((c) => c.id));
      check(ids.size === 6, 'grid clubs are distinct');
      check(grid.cellAnswerCounts.length === 9 && grid.cellAnswerCounts.every((n) => n >= XOX_MIN_CELL_ANSWERS), `all 9 cells have >= ${XOX_MIN_CELL_ANSWERS} answers`);
      console.log(`   grid: [${grid.rows.map((r) => r.name).join(' / ')}] × [${grid.cols.map((c) => c.name).join(' / ')}]`);
    }
  }

  const pair = await realPair();
  const FA: ClubRef = { id: 999999901, name: 'Fake A', logoUrl: null };
  const FB: ClubRef = { id: 999999902, name: 'Fake B', logoUrl: null };
  const FC: ClubRef = { id: 999999903, name: 'Fake C', logoUrl: null };
  const FD: ClubRef = { id: 999999904, name: 'Fake D', logoUrl: null };
  // Hücre 0 = gerçek çift (satır0 × sütun0); kalan hücreler sahte (cevapsız).
  const ROWS = [pair.a, FA, FB];
  const COLS = [pair.b, FC, FD];

  // ── Sıra dışı gönderim yok sayılır
  {
    const { room, b, bId, r } = makeXoxMatch(ROWS, COLS, 'a');
    room.handle(bId, { type: 'xox_submit', cell: 0, text: pair.player });
    await sleep(120);
    check(r.xox.cells[0].owner == null && b.count('xox_state') === 0, 'out-of-turn submit is ignored');
    (room as any).clearTimers?.();
  }

  // ── Doğru cevap hücreyi alır, sıra devrolur, iki taraf da aynı durumu görür
  {
    const { room, a, b, aId, bId, r } = makeXoxMatch(ROWS, COLS, 'a');
    room.handle(aId, { type: 'xox_submit', cell: 0, text: pair.player });
    await waitFor(() => r.xox.cells[0].owner != null);
    check(r.xox.cells[0].owner === aId, 'correct answer claims the cell');
    check(r.xox.turnId === bId && r.xox.turnNumber === 2, 'turn passes to opponent after claim');
    const sa = a.last('xox_state');
    const sb = b.last('xox_state');
    check(!!sa && !!sb && sa!.cells[0]!.owner === aId && sb!.cells[0]!.owner === aId && sa!.lastAction?.kind === 'claim', 'both clients receive identical authoritative state');
    (room as any).clearTimers?.();
  }

  // ── Yanlış cevap: sıra devrolur, hücre AÇIK kalır
  {
    const { room, a, aId, bId, r } = makeXoxMatch(ROWS, COLS, 'a');
    room.handle(aId, { type: 'xox_submit', cell: 0, text: 'kesinlikleyanlisisim' });
    await waitFor(() => r.xox.turnId === bId);
    check(r.xox.cells[0].owner == null, 'wrong answer leaves the cell open');
    check(r.xox.turnId === bId, 'wrong answer passes the turn');
    check((r.xox.wrongs.get(aId) ?? 0) === 1, 'wrong counted');
    check(a.last('xox_state')?.lastAction?.kind === 'wrong', 'wrong action announced');
    (room as any).clearTimers?.();
  }

  // ── Zaman aşımı sırayı devreder
  {
    const { room, aId, bId, r } = makeXoxMatch(ROWS, COLS, 'a');
    (room as any).xoxTimerFired();
    check(r.xox.turnId === bId && r.xox.turnNumber === 2, 'timeout passes the turn');
    check(r.xox.cells.every((c: any) => c.owner == null), 'timeout claims nothing');
    void aId;
    (room as any).clearTimers?.();
  }

  // ── Üçlü çizgi maçı bitirir (aynı ödeme hattı)
  {
    const { room, a, b, aId, r } = makeXoxMatch(ROWS, COLS, 'a');
    r.xox.cells[1] = { owner: aId, playerName: 'X', playerImageUrl: null };
    r.xox.cells[2] = { owner: aId, playerName: 'Y', playerImageUrl: null };
    room.handle(aId, { type: 'xox_submit', cell: 0, text: pair.player });
    await waitFor(() => !!a.last('xox_over'));
    const ov = a.last('xox_over');
    check(!!ov && ov!.winnerId === aId && ov!.reason === 'line' && JSON.stringify(ov!.line) === JSON.stringify([0, 1, 2]), 'three in a row wins with the winning line');
    check(b.last('xox_over')?.winnerId === aId, 'opponent sees the same result');
    check(r.matchOver === true && room.currentMatchId(), 'match is over server-side');
    (room as any).clearTimers?.();
  }

  // ── GERÇEK XOX kuralı (2026-08-27): çizgi yoksa tavanda BERABERE — çoğunluk
  //    kazandırmaz, altın hücre yok; iki taraf da xox_over(draw) görür.
  {
    const { room, a, b, aId, bId, r } = makeXoxMatch(ROWS, COLS, 'a');
    r.xox.cells[3] = { owner: aId, playerName: 'X', playerImageUrl: null };
    r.xox.cells[5] = { owner: aId, playerName: 'Y', playerImageUrl: null };
    r.xox.cells[7] = { owner: bId, playerName: 'Z', playerImageUrl: null };
    r.xox.turnNumber = XOX_TURN_CAP;
    (room as any).xoxTimerFired(); // tavandaki son tur zaman aşımı → çözüm
    await waitFor(() => !!a.last('xox_over'));
    const dov = a.last('xox_over');
    check(!!dov && dov!.winnerId === null && dov!.reason === 'draw', 'turn cap without a line ends in a draw');
    check(b.last('xox_over')?.reason === 'draw', 'both sides see the draw');
    check(r.xox.suddenDeath === false, 'no golden-cell sudden death is started');
    check(r.matchOver === true, 'draw closes the match server-side');
    (room as any).clearTimers?.();
  }

  // ── Reconnect: tam tahta durumu sunucudan geri gelir
  {
    const { room, a, aId, r } = makeXoxMatch(ROWS, COLS, 'a');
    r.xox.cells[4] = { owner: aId, playerName: 'Merkez', playerImageUrl: null };
    a.inbox.length = 0;
    (room as any).sendXoxStateTo(aId);
    const st = a.last('xox_state');
    check(!!st && st!.cells[4]!.owner === aId && st!.rows.length === 3, 'resume payload restores full board state');
    (room as any).clearTimers?.();
  }

  // ── Dolu hücreye gönderim yok sayılır
  {
    const { room, aId, bId, r } = makeXoxMatch(ROWS, COLS, 'a');
    r.xox.cells[0] = { owner: bId, playerName: 'Dolu', playerImageUrl: null };
    room.handle(aId, { type: 'xox_submit', cell: 0, text: pair.player });
    await sleep(300);
    check(r.xox.cells[0].owner === bId && r.xox.turnId === aId, 'occupied cell submit is ignored (no steal in v1)');
    (room as any).clearTimers?.();
  }

  console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL XOX SCENARIOS PASSED');
  await closePool().catch(() => {});
  process.exit(failed ? 1 : 0);
}

void main();
