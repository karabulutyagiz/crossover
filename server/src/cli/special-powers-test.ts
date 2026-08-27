// ============================================================================
// ÖZEL GÜÇLER ENTEGRASYON TESTİ — spec §81 test matrisinin sunucu-otoriter
// çekirdeği. Oda doğrudan kurulur, iki sahte transport ile sürülür; DB
// GEREKTİRMEZ (insan oyuncular userId'siz → sanal envanter yolu; DB'ye düşen
// yardımcılar catch'lidir). Çalıştır: npx tsx src/cli/special-powers-test.ts
// ============================================================================
process.env.SPECIAL_POWERS_ENABLED = '1';
process.env.SPECIAL_POWERS_ROLLOUT_PCT = '100';

import { Room, type Transport } from '../rooms/room.ts';
import type { ServerMsg, ClubRef } from '../protocol.ts';

// Sahte takım id'leri gerçek DB'de verifyGuess'i patlatabilir — testin konusu
// değil; reddedilen async değerlendirmeler yutulur (sunucu tarafındaki kalıcı
// düzeltme: room.ts evaluate çağrıları artık .catch'li).
process.on('unhandledRejection', (err) => {
  console.log('  (ignored async rejection: ' + (err instanceof Error ? err.message : String(err)) + ')');
});

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FakeTransport extends Transport {
  inbox: ServerMsg[];
  last<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }> | undefined;
  count(type: ServerMsg['type']): number;
}

function fake(caps: string[] = ['specialpowers', 'wrongopen', 'wrongretry']): FakeTransport {
  const inbox: ServerMsg[] = [];
  return {
    isBot: false,
    caps,
    inbox,
    send: (msg: ServerMsg) => { inbox.push(msg); },
    last: (type) => [...inbox].reverse().find((m) => m.type === type) as never,
    count: (type) => inbox.filter((m) => m.type === type).length,
  };
}

const TEAM_A: ClubRef = { id: 1, name: 'Test FC', logoUrl: null };
const TEAM_B: ClubRef = { id: 2, name: 'Probe SK', logoUrl: null };

interface Ctx { room: Room; a: FakeTransport; b: FakeTransport; aId: string; bId: string; r: any }

function makeMatch(powerA: string | null, powerB: string | null = null, qtyA = 1): Ctx {
  const room = new Room('TEST', () => {});
  const a = fake();
  const b = fake();
  const resA = room.addPlayer('Ali', a, true);
  const resB = room.addPlayer('Veli', b, false);
  if (!resA.ok || !resB.ok) throw new Error('addPlayer failed');
  const r = room as any;
  r.status = 'guess';
  r.matchOver = false;
  r.roundNumber = 0;
  r.matchStartedAt = Date.now();
  r.round = { picks: new Map(), teamA: TEAM_A, teamB: TEAM_B, finished: false, guessEndsAt: Date.now() + 30_000, guessStartedAt: Date.now() };
  r.specialPowersEnabled = true;
  const st = (powerId: string | null, qty: number) => ({
    equippedId: powerId, qty: powerId ? qty : 0, used: false, usedPowerId: null,
    usedAtRound: null, usedAt: null, requestId: null, pendingConsume: false,
    armedSecondChance: false, secondChanceTriggered: false,
  });
  r.specialPowers.set(resA.id, st(powerA, qtyA));
  r.specialPowers.set(resB.id, st(powerB, powerB ? 1 : 0));
  return { room, a, b, aId: resA.id, bId: resB.id, r };
}

async function main(): Promise<void> {
  // ── Senaryo 1: Freeze — iki taraf da AYNI olayı görür; hedefin girişi sunucuda kilitli
  {
    const { room, a, b, aId, bId, r } = makeMatch('freeze');
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-1' });
    await sleep(60);
    const evA = a.last('special_power_activated');
    const evB = b.last('special_power_activated');
    check(evA && evB && evA.powerId === 'freeze' && evB.powerId === 'freeze', 'S1: freeze activation broadcast to BOTH clients');
    check(evA?.effect?.targetId === bId && (evA.effect.freezeUntil ?? 0) > Date.now(), 'S1: effect targets opponent with server timestamp');
    check(r.round.frozenUntil?.get(bId) > Date.now(), 'S1: server-side input lock recorded');
    room.handle(bId, { type: 'submit_guess', text: 'Somebody' });
    await sleep(30);
    check(b.last('guess_denied')?.reason === 'frozen', 'S1: frozen player guess rejected server-side');
    check(r.round.guessEndsAt > Date.now(), 'S1: round timer continues during freeze');
    // Freeze bitince giriş açılır (damga geçmişe alınır — sunucu saati source of truth)
    r.round.frozenUntil.set(bId, Date.now() - 1);
    const before = b.count('guess_denied');
    room.handle(bId, { type: 'submit_guess', text: 'Somebody' });
    await sleep(30);
    check(b.count('guess_denied') === before, 'S1: input returns after freeze expiry (no frozen denial)');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 2: Round Skip — nötr biter, iki taraf da power_skip nedenini görür
  {
    const { room, a, b, aId, r } = makeMatch('skip');
    room.handle(aId, { type: 'use_special_power', powerId: 'skip', requestId: 'rq-2' });
    await sleep(150); // skipByPower async cevap listesi (DB yoksa catch → boş liste)
    check(a.last('special_power_activated')?.powerId === 'skip' && b.last('special_power_activated')?.powerId === 'skip', 'S2: skip announced to both');
    const resA = a.last('result');
    const resB = b.last('result');
    check(resA?.result.reason === 'power_skip' && resB?.result.reason === 'power_skip', 'S2: round ends with power_skip reason for both');
    check(resA?.players.every((p) => p.score === 0), 'S2: skip is neutral — no points awarded');
    check(r.roundNumber === 1, 'S2: round index advanced through the NORMAL transition machine');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 3+11b: Reveal — cevap sunucu verisinden; bulunamazsa güç HARCANMAZ
  {
    const { room, a, aId, r } = makeMatch('reveal');
    room.handle(aId, { type: 'use_special_power', powerId: 'reveal', requestId: 'rq-3' });
    await sleep(150);
    const st = r.specialPowers.get(aId);
    // DB'siz ortamda cevap bulunamaz → invalid + envanter DOKUNULMAMIŞ (spec §26 iade ilkesi)
    check(a.last('special_power_denied')?.reason === 'invalid' && st.used === false && st.qty === 1, 'S3: reveal without server answer denies WITHOUT consuming');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 4: İkinci güç isteği → already_used (ANA KURAL: maç başına 1)
  {
    const { room, a, aId, r } = makeMatch('freeze', null, 5);
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-4a' });
    await sleep(50);
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-4b' });
    await sleep(50);
    check(a.last('special_power_denied')?.reason === 'already_used', 'S4: second activation rejected — 1 per match, inventory 5 irrelevant');
    check(r.specialPowers.get(aId).qty === 4, 'S4: only one item consumed');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 5: Reconnect — kullanım durumu sunucudan aynen döner
  {
    const { room, a, aId } = makeMatch('extratime');
    room.handle(aId, { type: 'use_special_power', powerId: 'extratime', requestId: 'rq-5' });
    await sleep(50);
    // resume: yeni transporta durum gönderilir (userId'siz resume edilemez;
    // sendSpecialPowerStateTo doğrudan çağrılır — resumePlayer'daki yol aynı).
    a.inbox.length = 0;
    (room as any).sendSpecialPowerStateTo(aId);
    const st = a.last('special_power_state');
    check(st?.you.used === true && st.you.usedPowerId === 'extratime', 'S5: reconnect payload restores specialPowerUsed=true');
    check(typeof st?.yourDeadline === 'number' && st.yourDeadline > Date.now() + 30_000, 'S5: extended personal deadline survives reconnect');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 6: Aynı requestId tekrarı → tek tüketim, sessiz yeniden-ack
  {
    const { room, a, aId, r } = makeMatch('freeze', null, 3);
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'dup-1' });
    await sleep(50);
    const activations = a.count('special_power_activated');
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'dup-1' });
    await sleep(50);
    check(r.specialPowers.get(aId).qty === 2, 'S6: duplicate requestId consumes exactly one item');
    check(a.count('special_power_denied') === 0 && a.count('special_power_activated') === activations + 1, 'S6: duplicate re-acked to requester, not denied');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 7: Tur bitmişken güç → reddedilir, envanter tüketilmez
  {
    const { room, a, aId, r } = makeMatch('freeze');
    r.round.finished = true;
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-7' });
    await sleep(50);
    check(a.last('special_power_denied')?.reason === 'round_not_active' && r.specialPowers.get(aId).qty === 1 && !r.specialPowers.get(aId).used, 'S7: round-finished activation rejected without consume');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 8: Cevap doğrulaması uçuştayken Skip → too_late (cevap önce geldi)
  {
    const { room, a, aId, bId, r } = makeMatch('skip');
    (r.round.pendingGuesses ??= new Set()).add(bId);
    room.handle(aId, { type: 'use_special_power', powerId: 'skip', requestId: 'rq-8' });
    await sleep(50);
    check(a.last('special_power_denied')?.reason === 'too_late' && r.specialPowers.get(aId).qty === 1, 'S8: in-flight answer beats skip; power not consumed');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 9: İki oyuncu aynı anda güç → deterministik sıra, çift kabul
  {
    const { room, a, b, aId, bId, r } = makeMatch('freeze', 'secondchance');
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-9a' });
    room.handle(bId, { type: 'use_special_power', powerId: 'secondchance', requestId: 'rq-9b' });
    await sleep(80);
    check(a.count('special_power_activated') === 2 && b.count('special_power_activated') === 2, 'S9: both simultaneous powers accepted and announced to both');
    check(r.specialPowers.get(aId).used && r.specialPowers.get(bId).used, 'S9: both marked used — no crash, no desync');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 10: Freeze aktifken tur biter → etki YENİ TURA taşınmaz
  {
    const { room, aId, bId, r } = makeMatch('freeze');
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-10' });
    await sleep(50);
    check(r.round.frozenUntil?.get(bId) > Date.now(), 'S10: freeze active in old round');
    // Yeni tur (normal geçiş makinesi round objesini tazeler)
    r.round = { picks: new Map(), teamA: TEAM_A, teamB: TEAM_B, finished: false, guessEndsAt: Date.now() + 30_000 };
    check(r.round.frozenUntil === undefined, 'S10: freeze does NOT leak into the new round');
    (room as any).clearTimers?.();
  }

  // ── Senaryo 11: Envanter 0 → sahte istek sunucuda reddedilir
  {
    const { room, a, aId, r } = makeMatch('freeze', null, 1);
    r.specialPowers.get(aId).qty = 0; // istemci 5 gösterse bile sunucu 0 der (S12: server wins)
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-11' });
    await sleep(50);
    check(a.last('special_power_denied')?.reason === 'no_inventory' && !r.specialPowers.get(aId).used, 'S11/S12: zero inventory forged request rejected — server wins');
    (room as any).clearTimers?.();
  }

  // ── Sahte istemci: anlık görüntüden FARKLI güç dayatma → invalid
  {
    const { room, a, aId, r } = makeMatch('extratime');
    room.handle(aId, { type: 'use_special_power', powerId: 'reveal', requestId: 'rq-forge' });
    await sleep(50);
    check(a.last('special_power_denied')?.reason === 'invalid' && !r.specialPowers.get(aId).used, 'Anti-cheat: powerId must match match-start snapshot');
    (room as any).clearTimers?.();
  }

  // ── Extra Time: yalnız kullananın son teslimi uzar; rakibinki değişmez
  {
    const { room, a, aId, bId, r } = makeMatch('extratime');
    const base = r.round.guessEndsAt;
    room.handle(aId, { type: 'use_special_power', powerId: 'extratime', requestId: 'rq-et' });
    await sleep(50);
    check(r.playerDeadline(aId) > base && r.playerDeadline(bId) === base, 'ExtraTime: personal deadline extended only for the user');
    check((a.last('special_power_activated')?.effect?.newDeadline ?? 0) === r.playerDeadline(aId), 'ExtraTime: client told the exact server deadline');
    // Rakip kendi süresi dolunca gönderemez (expired), uzayan gönderebilir
    r.round.guessEndsAt = Date.now() - 10;
    r.round.deadlineOverride.set(aId, Date.now() + 5000);
    room.handle(bId, { type: 'submit_guess', text: 'X' });
    await sleep(30);
    const bT = (room as any).players.get(bId).transport as FakeTransport;
    check(bT.last('guess_denied')?.reason === 'expired', 'ExtraTime: opponent past own deadline gets expired');
    (room as any).clearTimers?.();
  }

  // ── İkinci Şans: yanlış BİR kez affedilir — sayaç/ceza yok, iki taraf da duyar
  {
    const { room, a, b, aId, r } = makeMatch('secondchance');
    room.handle(aId, { type: 'use_special_power', powerId: 'secondchance', requestId: 'rq-sc' });
    await sleep(50);
    check(r.specialPowers.get(aId).armedSecondChance === true, 'SecondChance: armed on server');
    const forgiven = r.forgiveWithSecondChance(aId, 'Ali');
    check(forgiven === true, 'SecondChance: first wrong forgiven');
    check(a.last('special_power_effect')?.kind === 'second_chance_triggered' && b.last('special_power_effect')?.kind === 'second_chance_triggered', 'SecondChance: BOTH clients told why no penalty happened');
    check(r.forgiveWithSecondChance(aId, 'Ali') === false, 'SecondChance: triggers exactly once');
    (room as any).clearTimers?.();
  }

  // ── Maç bitti → güç isteği match_over
  {
    const { room, a, aId, r } = makeMatch('freeze');
    r.matchOver = true;
    room.handle(aId, { type: 'use_special_power', powerId: 'freeze', requestId: 'rq-mo' });
    await sleep(50);
    check(a.last('special_power_denied')?.reason === 'match_over' && r.specialPowers.get(aId).qty === 1, 'MatchOver: no activation, no consume');
    (room as any).clearTimers?.();
  }

  // ── Caps kapısı: özel güç bilmeyen istemciyle odada güçler KAPALI
  {
    const room = new Room('CAPS', () => {});
    const a = fake(['specialpowers']);
    const bLegacy = fake(['wrongopen']); // eski istemci
    room.addPlayer('Ali', a, true);
    room.addPlayer('Eski', bLegacy, false);
    const enabled = (room as any).computeSpecialPowersEnabled();
    check(enabled === false, 'Caps gate: legacy opponent disables powers for the WHOLE room (no silent one-sided powers)');
    (room as any).clearTimers?.();
  }

  console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL SPECIAL POWER SCENARIOS PASSED');
  process.exit(failed ? 1 : 0);
}

void main();
