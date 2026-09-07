// UI2 — TURNUVALAR sekmesi. Mock: refs/tournaments.png. Veri: state.tournaments (sunucu), Seviye Yolu ödülleri (gerçek).
import { useEffect } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { LEVEL_TIERS, levelRewardGems, passRewardView } from '../screens';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { Bar, ChunkyButton, GemAmount, OutlinedText, Plate, SectionHeader, fmt } from './primitives';
import { Hud } from './Shell';
import { S } from './strings';
import { C, F, LIP, OUTLINE, R, SIDE, mk } from './tokens';

type TItem = NonNullable<GameState['tournaments']>[number];
export type TournamentsTabProps = { state: GameState; actions: Actions; onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void; onOpenLevelRoad: () => void; onOpenLeague: () => void; onOpenTournament: (id: string) => void; onNotice: (title: string, body: string) => void };

export function TournamentsTab({ state, actions, onOpenSettings, onOpenProfile, onOpenArenas, onOpenLevelRoad, onOpenLeague, onOpenTournament, onNotice }: TournamentsTabProps) {
  const p = state.profile;
  const items = state.tournaments ?? [];
  useEffect(() => { actions.listTournaments(); }, [actions]);
  const featured = items.find((t) => t.status === 'live') ?? items.find((t) => t.status === 'registration') ?? items[0] ?? null;
  const active = items.filter((t) => t.status !== 'finished' && t !== featured);
  const upcoming = items.filter((t) => t.status === 'registration' && !t.youJoined && t !== featured);
  const level = p?.level ?? 1; const claimed = new Set(p?.claimedLevels ?? []);
  // Seviye Yolu ödülü: CO-PASS v2 açıksa her seviyede (passRewardView), değilse eski düzen
  // (her 5. seviye elmas, 10/20/30/40/50 çerçeve). Sonraki 3 ödüllü seviye gösterilir.
  const POWER_ART: Record<string, ImageSourcePropType> = { xp2x: UI2.pw_xp, shield: UI2.pw_shield, streak: UI2.pw_streak, training: UI2.pw_training, freeze: UI2.pw_freeze };
  const rewardAt = (n: number): { label: string; art: ImageSourcePropType } | null => {
    if (p?.copassV2) {
      const r = passRewardView(n, 'free'); if (!r) return null;
      if (r.frameTier) return { label: S.specialFrame, art: UI2.rw_frame };
      if (r.cosmeticId) return { label: 'Kozmetik', art: UI2.rw_frame };
      if (r.specialPower || r.roadPower) { const id = (r.specialPower ?? r.roadPower) as string; return { label: 'Güç', art: POWER_ART[id] ?? UI2.sec_power }; }
      if (r.diamonds) return { label: S.gemsN(r.diamonds), art: UI2.rw_gems };
      return null;
    }
    if (LEVEL_TIERS.some((t) => t.min === n)) return { label: S.specialFrame, art: UI2.rw_frame };
    const g = levelRewardGems(n); return g ? { label: S.gemsN(g), art: UI2.rw_gems } : null;
  };
  const roadLevels: number[] = []; for (let n = level; n <= 50 && roadLevels.length < 3; n++) if (rewardAt(n)) roadLevels.push(n);
  const joinBtn = (t: TItem, kind: 'green' | 'gold' = 'green') => t.youJoined
    ? { kind: 'blue' as const, label: t.status === 'live' ? S.view : S.joined, on: () => onOpenTournament(t.id) }
    : { kind, label: S.join, on: () => { actions.joinTournament(t.id); onNotice(t.name, `${S.join} → ${S.joined}`); } };
  return (
    <View style={{ flex: 1 }}>
      <Hud title={S.tournaments} titleIcon={UI2.title_trophy}
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies: p?.trophies ?? 0, diamonds: p?.diamonds ?? 0 }}
        actions={{ onAvatar: onOpenProfile, onSettings: onOpenSettings, onTrophies: onOpenArenas }} />

      {/* ── CANLI ETKİNLİK banner'ı ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(4) }}>
        <Plate face="#0B2F8C" top="#3A7BFF" lip="#061B52" radius={mk(26)} inner={{ overflow: 'hidden' }}>
          <View style={{ height: mk(250) }}>
            <Image source={UI2.tn_banner_art} style={{ position: 'absolute', right: 0, top: 0, width: mk(450), height: mk(250) }} resizeMode="cover" />
            <View style={{ position: 'absolute', right: mk(14), top: mk(12), backgroundColor: C.panelInk, borderRadius: mk(14), borderWidth: mk(3), borderColor: C.navy, paddingHorizontal: mk(12), paddingVertical: mk(4), flexDirection: 'row', alignItems: 'center', gap: mk(6) }}>
              <Image source={UI2.ic_clock_live} style={{ width: mk(30), height: mk(30) }} resizeMode="contain" />
              <OutlinedText size={mk(20)} width={1.2}>{featured?.status === 'live' ? S.ongoing : featured ? `${featured.joined}/${featured.size}` : '—'}</OutlinedText>
            </View>
            <View style={{ position: 'absolute', left: mk(20), top: mk(14) }}>
              <View style={{ backgroundColor: C.red, borderRadius: mk(10), borderWidth: mk(3), borderColor: C.navy, paddingHorizontal: mk(14), paddingVertical: mk(2), flexDirection: 'row', alignItems: 'center', gap: mk(8), alignSelf: 'flex-start' }}>
                <View style={{ width: mk(16), height: mk(16), borderRadius: mk(8), backgroundColor: C.white }} />
                <OutlinedText size={mk(20)} width={1.2}>{S.liveEvent}</OutlinedText>
              </View>
              <OutlinedText size={mk(50)} width={mk(5)} align="left" numberOfLines={2} style={{ marginTop: mk(12), width: mk(430), lineHeight: mk(54) }}>{(featured?.name ?? 'Şampiyonlar Kupası').toLocaleUpperCase('tr')}</OutlinedText>
              <Text style={{ color: C.white, fontFamily: F.semi, fontSize: mk(19), lineHeight: mk(24), marginTop: mk(8), width: mk(420) }}>{S.tournamentDesc}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.panelInk, paddingHorizontal: mk(14), paddingVertical: mk(10), gap: mk(10) }}>
            <Image source={UI2.tn_bigreward} style={{ width: mk(110), height: mk(70) }} resizeMode="contain" />
            <View><Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(18) }}>{S.bigPrize}</Text><OutlinedText size={mk(30)} width={mk(3)} color={C.gold} align="left">{S.gemsN(featured?.prizeFirst ?? 0)}</OutlinedText></View>
            <View style={{ width: mk(3), height: mk(60), backgroundColor: C.navy, marginHorizontal: mk(6) }} />
            <View><Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(18) }}>{S.entry}</Text><OutlinedText size={mk(26)} width={mk(2)} align="left">{featured && featured.entryFee > 0 ? S.gemsN(featured.entryFee) : S.free}</OutlinedText></View>
            <View style={{ flex: 1 }} />
            {featured ? <ChunkyButton kind={joinBtn(featured).kind} label={joinBtn(featured).label} height={mk(76)} size={mk(32)} style={{ width: mk(270) }} onPress={joinBtn(featured).on} /> : <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(18) }}>{S.noTournaments}</Text>}
          </View>
        </Plate>
      </View>

      {/* ── Üç hızlı kutu ── */}
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, marginTop: mk(20), gap: mk(16) }}>
        {([
          { icon: UI2.ic_daily, title: S.daily, sub: S.dailySub, on: () => onNotice(S.daily, S.noTournaments) },
          { icon: UI2.ic_league, title: S.leagueCup, sub: S.leagueCupSub, on: onOpenLeague },
          { icon: UI2.ic_rewards, title: S.rewards, sub: S.rewardsSub, on: onOpenLevelRoad },
        ] as { icon: ImageSourcePropType; title: string; sub: string; on: () => void }[]).map((a) => (
          <Plate key={a.title} face={C.card} top={C.cardTop} lip={C.cardDark} radius={mk(22)} style={{ flex: 1 }} inner={{ height: mk(116) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(8), gap: mk(6) }}>
            <Image source={a.icon} style={{ width: mk(84), height: mk(84) }} resizeMode="contain" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <OutlinedText size={mk(20)} width={mk(2)} align="left" numberOfLines={1}>{a.title}</OutlinedText>
              <Text numberOfLines={1} style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(14) }}>{a.sub}</Text>
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="box-only" onTouchEnd={a.on} />
          </Plate>
        ))}
      </View>

      {/* ── AKTİF TURNUVALAR ── */}
      <SectionHeader icon={UI2.hud_trophy} title={S.activeTournaments} subtitle={S.activeSub} style={{ marginHorizontal: SIDE, marginTop: mk(18) }} />
      <View style={{ marginHorizontal: SIDE, gap: mk(12) }}>
        {active.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(22), textAlign: 'center', paddingVertical: mk(10) }}>{items.length ? '' : S.noTournaments}</Text> : null}
        {active.map((t, i) => (
          <TRow key={t.id} icon={i % 2 === 0 ? UI2.ac_laurel : UI2.ac_stadium} name={t.name} meta={`${S.players(t.size)} • ${S.singleElim}`} status={t.status === 'live' ? S.ongoing : S.registration} live={t.status === 'live'} prize={t.prizeFirst} button={joinBtn(t, 'gold')} />
        ))}
      </View>

      {/* ── ÖDÜL YOLU (Seviye Yolu — gerçek ödüller) ── */}
      <SectionHeader icon={UI2.sec_gift} title={S.rewardRoad} subtitle={S.rewardRoadSub} style={{ marginHorizontal: SIDE, marginTop: mk(20) }} />
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, alignItems: 'center', gap: mk(6) }}>
        {roadLevels.map((n, i) => {
          const rw = rewardAt(n)!; const label = rw.label; const art = rw.art;
          const canClaim = n <= level && !claimed.has(n); const done = claimed.has(n);
          return (
            <View key={n} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Plate face={i === 0 ? '#6A21E6' : C.card} top={i === 0 ? '#B57BFF' : C.cardTop} lip={i === 0 ? '#3E0E9A' : C.cardDark} radius={mk(22)} style={{ flex: 1 }} inner={{ height: mk(236) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(8), paddingHorizontal: mk(6) }}>
                <OutlinedText size={mk(24)} width={mk(2)}>{S.levelN(n)}</OutlinedText>
                <Image source={art} style={{ width: '90%', height: mk(92), marginTop: mk(4) }} resizeMode="contain" />
                <OutlinedText size={mk(21)} width={1.5} numberOfLines={1}>{label}</OutlinedText>
                <View style={{ flex: 1 }} />
                {done ? <Image source={UI2.rw_check} style={{ width: mk(52), height: mk(52), marginBottom: mk(6) }} resizeMode="contain" />
                  : canClaim ? <ChunkyButton kind="green" label={S.claim} height={mk(50)} size={mk(22)} style={{ width: '90%', marginBottom: mk(8) }} onPress={() => actions.claimLevelReward(n)} />
                  : <View style={{ width: '92%', marginBottom: mk(10), flexDirection: 'row', alignItems: 'center', gap: mk(6) }}><Bar value={level} max={n} color={C.gold} track="#04163F" height={mk(22)} radius={mk(7)} style={{ flex: 1 }} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(18) }}>{`${level}/${n}`}</Text></View>}
              </Plate>
              {i < roadLevels.length - 1 ? <Image source={UI2.rw_arrow} style={{ width: mk(30), height: mk(40), marginHorizontal: mk(2) }} resizeMode="contain" /> : null}
            </View>
          );
        })}
      </View>

      {/* ── YAKLAŞAN TURNUVALAR ── */}
      {upcoming.length ? (
        <>
          <SectionHeader icon={UI2.sec_calendar} title={S.upcoming} subtitle={S.upcomingSub} style={{ marginHorizontal: SIDE, marginTop: mk(20) }} />
          <View style={{ marginHorizontal: SIDE, gap: mk(12) }}>
            {upcoming.map((t, i) => (
              <TRow key={t.id} icon={i % 2 === 0 ? UI2.up_handshake : UI2.up_crown} name={t.name} meta={`${S.registration} • ${t.joined}/${t.size}`} status="" live={false} prize={t.prizeFirst} button={{ kind: 'blue', label: S.join, on: () => actions.joinTournament(t.id) }} compact />
            ))}
          </View>
          <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(20), textAlign: 'center', marginTop: mk(16) }}>⌄  {S.moreTournaments}  ⌄</Text>
        </>
      ) : null}
      <View style={{ height: mk(30) }} />
    </View>
  );
}
function TRow({ icon, name, meta, status, live, prize, button, compact }: { icon: ImageSourcePropType; name: string; meta: string; status: string; live: boolean; prize: number; button: { kind: 'green' | 'gold' | 'blue'; label: string; on: () => void }; compact?: boolean }) {
  return (
    <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(20)} inner={{ height: (compact ? mk(96) : mk(110)) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
      <View style={{ width: mk(120), height: mk(90), alignItems: 'center', justifyContent: 'center' }}><Image source={icon} style={{ width: mk(116), height: mk(86) }} resizeMode="contain" /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <OutlinedText size={mk(28)} width={mk(2)} align="left" numberOfLines={1}>{name}</OutlinedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(6), marginTop: mk(2) }}>
          <Text numberOfLines={1} style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(15), flexShrink: 1 }}>{meta}</Text>
          {status ? <><View style={{ width: mk(14), height: mk(14), borderRadius: mk(7), backgroundColor: live ? C.green : C.gold }} /><Text numberOfLines={1} style={{ color: live ? '#9BFFA7' : C.gold, fontFamily: F.bold, fontSize: mk(15) }}>{status}</Text></> : null}
        </View>
      </View>
      <View style={{ backgroundColor: '#0A2B78', borderRadius: mk(12), paddingHorizontal: mk(10), paddingVertical: mk(6), borderWidth: mk(3), borderColor: C.navy }}>
        <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(15) }}>{S.prize}</Text>
        <GemAmount amount={`${fmt(prize)} Elmas`} size={mk(20)} family={F.black} />
      </View>
      <ChunkyButton kind={button.kind} label={button.label} height={mk(66)} size={mk(26)} style={{ width: mk(170) }} onPress={button.on} />
    </Plate>
  );
}
export { R };
