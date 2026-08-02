// Ülke-takım UÇTAN-UCA regresyon: gerçek Room + BotPlayer'ı in-process sürüp,
// insanın seçtiği GERÇEK takım/ülke ile turun ASLA yanlış atlanmadığını kanıtlar.
// Bot artık veri-güdümlü (pickCountryForClub/pickClubForCountry) olduğundan her
// reveal'da ortak oyuncu bulunmalı → guess_phase'e geçilmeli, no_match ile atlanmamalı.
import { Room } from '../rooms/room.ts';
import type { Transport } from '../rooms/room.ts';
import { BotPlayer } from '../rooms/bot.ts';
import type { ServerMsg } from '../protocol.ts';
import { hasPlayersCountryTeam, commonPlayersCountryTeam } from '../game/verify.ts';
import { pool, closePool } from '../db/pool.ts';

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

// İnsanın maç boyu döneceği gerçek takımlar ve ülkeler (hepsi DB'de dolu).
const HUMAN_TEAMS = ['Beşiktaş', 'Galatasaray', 'Barcelona', 'Real Madrid', 'Liverpool', 'Juventus'];
const HUMAN_COUNTRIES = ['Türkiye', 'Brazil', 'France', 'Spain', 'England', 'Germany'];

let failed = false;
const fail = (m: string) => { console.log('❌', m); failed = true; };

async function main() {
  const teamIds = new Map<string, number>();
  for (const t of HUMAN_TEAMS) { const id = await resolveClubId(t); if (id) teamIds.set(t, id); }

  const REVEAL_TARGET = 6; // en az bu kadar reveal gözlemle (her iki rol yönü)
  let reveals = 0, skips = 0, falseSkips = 0, guesses = 0;
  let teamIdx = 0, countryIdx = 0;
  let lastReveal: { country: string; teamId: number } | null = null;
  let done = false;

  const room = new Room('CTE2E', () => {});

  // Sahte insan transport'u: pick_phase'de GERÇEK bir takım/ülke seçer,
  // guess_phase'de doğru cevabı gönderir, reveal/atlama olaylarını denetler.
  const human: Transport = {
    isBot: false,
    send(msg: ServerMsg) {
      const m = msg as any;
      if (m.type === 'pick_phase') {
        const role = m.pickRole ?? 'team';
        if (role === 'team') {
          // kullanılmamış gerçek bir takım seç
          for (let k = 0; k < HUMAN_TEAMS.length; k++) {
            const name = HUMAN_TEAMS[(teamIdx + k) % HUMAN_TEAMS.length]!;
            const id = teamIds.get(name);
            if (id && !(m.usedClubIds ?? []).includes(id)) { teamIdx = (teamIdx + k + 1) % HUMAN_TEAMS.length; room.handle(humanId, { type: 'pick_team', clubId: id }); return; }
          }
        } else if (role === 'country') {
          const name = HUMAN_COUNTRIES[countryIdx % HUMAN_COUNTRIES.length]!;
          countryIdx++;
          room.handle(humanId, { type: 'pick_country', country: name });
        }
      } else if (m.type === 'reveal_teams' && m.mode === 'country-team') {
        reveals++;
        lastReveal = { country: m.country, teamId: m.teamB.id };
      } else if (m.type === 'guess_phase') {
        guesses++;
        // doğru cevabı gönder ki tur ilerlesin
        if (lastReveal) {
          void commonPlayersCountryTeam(lastReveal.teamId, lastReveal.country, 1).then((ps) => {
            room.handle(humanId, { type: 'submit_guess', text: ps[0]?.name ?? 'zzz' });
          });
        }
      } else if (m.type === 'result') {
        // Atlama mı? reason === 'no_match' ve teamA (ülke) + teamB (takım) varsa
        if (m.reason === 'no_match' && lastReveal) {
          skips++;
          const lr = lastReveal;
          // GERÇEKTEN oyuncu var mıydı? Varsa bu YANLIŞ atlama = bug.
          void hasPlayersCountryTeam(lr.teamId, lr.country).then((has) => {
            if (has) { falseSkips++; fail(`YANLIŞ ATLAMA: ${lr.country} + team#${lr.teamId} oyuncusu VAR ama atlandı`); }
          });
        }
        lastReveal = null;
        // Maç bittiyse yeterli reveal yoksa rematch iste (bot kabul eder) — daha fazla tur
        if (m.matchOver) {
          if (reveals < REVEAL_TARGET) room.handle(humanId, { type: 'play_again' });
          else done = true;
        }
      } else if (m.type === 'waiting_ready') {
        room.handle(humanId, { type: 'ready' });
      }
      if (reveals >= REVEAL_TARGET && !done) { done = true; }
    },
  };

  const addH = room.addPlayer('Human', human, true); // userId yok → XP/DB yazımı denenmez
  const humanId = addH.ok ? addH.id : '';
  const bot = new BotPlayer({ difficulty: 'medium', scope: { type: 'all' }, mode: 'country-team' });
  room.gameMode = 'country-team';
  const addB = room.addPlayer('Bot', bot, false);
  if (addB.ok) bot.bind(room, addB.id);

  room.handle(humanId, { type: 'start' });

  // reveal hedefine ulaşana kadar bekle (zamanlayıcılar gerçek zamanlı)
  const t0 = Date.now();
  while (!done && Date.now() - t0 < 90_000) {
    await new Promise((r) => setTimeout(r, 500));
  }
  // asenkron hasPlayers denetimleri otursun diye kısa bekleme
  await new Promise((r) => setTimeout(r, 1500));

  console.log(`\nreveal=${reveals} guess=${guesses} skip=${skips} falseSkip=${falseSkips}`);
  if (reveals === 0) fail('hiç reveal gözlemlenmedi (akış kurulamadı)');
  if (falseSkips > 0) fail(`${falseSkips} YANLIŞ atlama`);
  console.log(failed ? '\n❌ CTE2E FAILED' : '\n✅ CTE2E PASSED — hiçbir tur yanlış atlanmadı');
  await closePool();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => { console.error('cte2e error:', e); await closePool().catch(() => {}); process.exit(1); });
