// UI2 — ARKADAŞLAR sekmesi. Mock: refs/friends.png (941 px, mk()). Veri: state.friends/friendRequests/userSearchResults.
import { useEffect, useState } from 'react';
import { Image, Pressable, Share, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { Avatar } from '../Avatar';
import { track } from '../telemetry';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { Bar, BannerImage, ChunkyButton, GemAmount, IconSlot, OutlinedText, Plate, SectionHeader, fitSize, fmt } from './primitives';
import { IcAddFriend, IcArrowRight, IcCheckBadge, IcGift, IcInviteCode, IcNavFriends, IcRequests, IcSuggest, IcTrophy } from './icons-ui';
import { Hud } from './Shell';
import { t } from '../i18n';
import { S } from './strings';
import { C, F, fz, GAP, LIP, mk, OUTLINE, R, SIDE, SW } from './tokens';

const REFERRAL_REWARD = 100; // sunucu kuralı: davet kodunu giren ve davet eden 100 💎
export type FriendsTabProps = { state: GameState; actions: Actions; onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void; onOpenRequests: () => void; onOpenAddFriend: () => void; onNotice: (title: string, body: string) => void };

export function FriendsTab({ state, actions, onOpenSettings, onOpenProfile, onOpenArenas, onOpenRequests, onOpenAddFriend, onNotice }: FriendsTabProps) {
  const p = state.profile;
  const code = p?.userId?.slice(0, 8).toUpperCase() ?? '…';
  const friends = state.friends;
  const onlineCount = friends.filter((f) => f.online).length;
  const [q, setQ] = useState('');
  useEffect(() => { actions.loadFriends(); }, [actions]);
  const share = () => {
    track('referral_share', {});
    void Share.share({ message: t('ui2.inviteShareMsg', { code, n: REFERRAL_REWARD, url: 'https://crossoverfootball.com/indir' }) }).catch(() => {});
  };
  const W = SW - SIDE * 2;
  return (
    <View style={{ flex: 1 }}>
      <Hud title={S.friends} titleIcon={<IcNavFriends />}
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level: p?.level ?? 1, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies: p?.trophies ?? 0, diamonds: p?.diamonds ?? 0 }}
        actions={{ onAvatar: onOpenProfile, onSettings: onOpenSettings, onTrophies: onOpenArenas }} />

      {/* ── ARKADAŞINI DAVET ET banner'ı: kullanıcının sanatı (iki karakter + elmaslar sağda), başlık/açıklama/ödül/buton CANLI (21 dil) ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(4) }}>
        <BannerImage source={UI2.banner_invite} ratio={2.5}>
          <View style={{ position: 'absolute', left: '3.5%', top: '7%', width: '41%', height: '40%', justifyContent: 'center' }}>
            <OutlinedText size={fitSize(mk(46), S.inviteTitle.length >= S.inviteTitle2.length ? S.inviteTitle : S.inviteTitle2, 11)} width={mk(4)} color="#E9C8FF" align="left" numberOfLines={1}>{S.inviteTitle}</OutlinedText>
            <OutlinedText size={fitSize(mk(46), S.inviteTitle.length >= S.inviteTitle2.length ? S.inviteTitle : S.inviteTitle2, 11)} width={mk(4)} color={C.gold} align="left" numberOfLines={1} style={{ marginTop: -mk(6) }}>{S.inviteTitle2}</OutlinedText>
          </View>
          <View style={{ position: 'absolute', left: '3.5%', top: '46%', width: '42%', height: '32%', justifyContent: 'center' }}>
            <Text numberOfLines={3} style={{ color: C.white, fontFamily: F.bold, fontSize: fitSize(fz(19), S.inviteDesc, 78), lineHeight: fitSize(fz(19), S.inviteDesc, 78) * 1.18 }}>{S.inviteDesc}</Text>
          </View>
          <View style={{ position: 'absolute', left: '3.5%', top: '79%', width: '22%', height: '16%', backgroundColor: '#0C1E5C', borderRadius: mk(14), borderWidth: mk(3), borderColor: C.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(6) }}>
            <OutlinedText size={mk(22)} width={mk(2)} numberOfLines={1} fit>{S.gemsN(REFERRAL_REWARD)}</OutlinedText>
          </View>
          <View style={{ position: 'absolute', left: '69%', top: '72%', width: '28%', height: '23%' }}>
            <ChunkyButton kind="green" label={S.inviteBtn} height={mk(80)} size={mk(28)} onPress={share} style={{ flex: 1 }} />
          </View>
        </BannerImage>
      </View>

      {/* ── Üç eylem kutusu ── */}
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, marginTop: mk(22), gap: mk(16) }}>
        {([
          { icon: <IcAddFriend />, title: S.addFriend, sub: S.addFriendSub, on: onOpenAddFriend, badge: 0 },
          { icon: <IcInviteCode />, title: S.inviteCode, sub: S.inviteCodeSub, on: share, badge: 0 },
          { icon: <IcRequests />, title: S.requests, sub: S.requestsSub, on: onOpenRequests, badge: state.friendRequests.length },
        ] as { icon: React.ReactNode; title: string; sub: string; on: () => void; badge: number }[]).map((a) => (
          <Pressable key={a.title} onPress={a.on} style={{ flex: 1 }}>
            <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={mk(22)} inner={{ height: mk(130) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(8), gap: mk(6) }}>
              <IconSlot icon={a.icon} width={mk(80)} height={mk(80)} size={mk(80)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <OutlinedText size={mk(21)} width={mk(2)} align="left" numberOfLines={1} fit>{a.title}</OutlinedText>
                <Text numberOfLines={2} style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(15), lineHeight: fz(18) }}>{a.sub}</Text>
              </View>
            </Plate>
            {a.badge ? <View style={{ position: 'absolute', top: -mk(10), right: -mk(6), minWidth: mk(44), height: mk(44), borderRadius: mk(22), backgroundColor: C.red, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(24)} width={1}>{String(a.badge)}</OutlinedText></View> : null}
          </Pressable>
        ))}
      </View>

      {/* ── ÇEVRİMİÇİ ARKADAŞLAR ── */}
      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: mk(78), paddingHorizontal: mk(8) }}>
          <View style={{ width: mk(40), height: mk(40), borderRadius: mk(20), backgroundColor: C.green, borderWidth: mk(3), borderColor: C.navy }} />
          <OutlinedText size={mk(40)} width={mk(4)} align="left" style={{ marginLeft: mk(14) }}>{S.onlineFriends}</OutlinedText>
          <View style={{ flex: 1 }} />
          <OutlinedText size={mk(30)} width={mk(3)}>{`${onlineCount} / ${friends.length}`}</OutlinedText>
        </View>
        {friends.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(22), textAlign: 'center', paddingVertical: mk(20) }}>{S.noFriends}</Text> : null}
        {[...friends].sort((a, b) => Number(b.online) - Number(a.online) || b.trophies - a.trophies).slice(0, 8).map((f) => {
          const mins = f.lastSeen ? Math.max(0, Math.round((Date.now() - new Date(f.lastSeen).getTime()) / 60000)) : null;
          return (
            <Plate key={f.userId} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginTop: mk(10) }} inner={{ minHeight: mk(74) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(8), gap: mk(10) }}>
              <Pressable onPress={() => actions.getUserProfile(f.userId)}><View style={{ width: mk(60), height: mk(60), borderRadius: mk(12), borderWidth: mk(3), borderColor: '#7DB8FF', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Avatar avatar={f.avatar ?? f.selectedAvatar} name={f.displayName} size={mk(50)} /></View></Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <OutlinedText size={mk(28)} width={mk(2)} align="left" numberOfLines={1}>{f.displayName.toLocaleUpperCase('tr')}</OutlinedText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(6), marginTop: mk(2) }}>
                  <IcTrophy size={mk(30)} />
                  <Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(19) }}>{fmt(f.trophies)}</Text>
                  <View style={{ width: mk(18), height: mk(18), borderRadius: mk(9), backgroundColor: f.online ? C.green : C.gray, borderWidth: 1.5, borderColor: C.navy, marginLeft: mk(8) }} />
                  <Text numberOfLines={1} style={{ color: f.online ? '#9BFFA7' : C.textMuted, fontFamily: F.bold, fontSize: fz(17), flexShrink: 1 }}>{f.online ? S.online : mins == null ? S.offline : S.minAgo(mins)}</Text>
                </View>
              </View>
              <ChunkyButton kind={f.online ? 'green' : 'gray'} label={S.inviteRow} height={mk(58)} size={mk(24)} style={{ width: mk(180) }} disabled={!f.online} onPress={() => actions.inviteFriendMatch(f.userId, f.displayName)} />
            </Plate>
          );
        })}
      </Panel>

      {/* ── SOSYAL ÖDÜLLER (arkadaş sayısına bağlı yol; ödül teslimi sunucu tarafında henüz yok → YAKINDA) ── */}
      <SectionHeader icon={<IcGift />} title={S.socialRewards} subtitle={S.socialRewardsSub} style={{ marginHorizontal: SIDE, marginTop: mk(20) }} />
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, alignItems: 'center', gap: mk(6) }}>
        {([{ n: 1, art: UI2.rw_gems, label: S.gemsN(50) }, { n: 3, art: UI2.rw_emote, label: S.specialEmote }, { n: 5, art: UI2.rw_frame, label: S.specialFrame }] as const).map((r, i) => {
          const done = friends.length >= r.n;
          return (
            <View key={r.n} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Plate face={i === 0 ? '#6A21E6' : C.card} top={i === 0 ? '#B57BFF' : C.cardTop} lip={i === 0 ? '#3E0E9A' : C.cardDark} radius={mk(22)} style={{ flex: 1 }} inner={{ minHeight: mk(236) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(8), paddingHorizontal: mk(6) }}>
                <OutlinedText size={mk(24)} width={mk(2)}>{S.friendsN(r.n)}</OutlinedText>
                <Image source={r.art} style={{ width: '90%', height: mk(96), marginTop: mk(4) }} resizeMode="contain" />
                <OutlinedText size={mk(21)} width={1.5} style={{ marginTop: mk(2) }}>{r.label}</OutlinedText>
                <View style={{ flex: 1 }} />
                {done ? <View style={{ marginBottom: mk(6) }}><IcCheckBadge size={mk(50)} /></View>
                  : <View style={{ width: '92%', marginBottom: mk(10), flexDirection: 'row', alignItems: 'center', gap: mk(6) }}><Bar value={friends.length} max={r.n} color={C.gold} track="#04163F" height={mk(22)} radius={mk(7)} style={{ flex: 1 }} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(18) }}>{`${Math.min(friends.length, r.n)}/${r.n}`}</Text></View>}
              </Plate>
              {i < 2 ? <View style={{ marginHorizontal: mk(2) }}><IcArrowRight size={mk(36)} /></View> : null}
            </View>
          );
        })}
      </View>

      {/* ── ARKADAŞ ÖNERİLERİ → kullanıcı arama ── */}
      <SectionHeader icon={<IcSuggest />} title={S.suggestions} subtitle={S.suggestionsSub} style={{ marginHorizontal: SIDE, marginTop: mk(20) }} />
      <View style={{ marginHorizontal: SIDE }}>
        <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ minHeight: mk(74) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(14), gap: mk(10) }}>
          <TextInput value={q} onChangeText={setQ} placeholder={S.searchPlaceholder} placeholderTextColor={C.textMuted} autoCapitalize="none" autoCorrect={false} returnKeyType="search" onSubmitEditing={() => q.trim() && actions.searchUsers(q.trim())} style={{ flex: 1, color: C.white, fontFamily: F.bold, fontSize: fz(22), padding: 0 }} />
          <ChunkyButton kind="blue" label={S.search} height={mk(52)} size={mk(22)} style={{ width: mk(120) }} onPress={() => q.trim() && actions.searchUsers(q.trim())} />
        </Plate>
        {state.userSearchResults.map((u) => (
          <Plate key={u.userId} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginTop: mk(10) }} inner={{ minHeight: mk(74) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
            <View style={{ width: mk(60), height: mk(60), borderRadius: mk(12), borderWidth: mk(3), borderColor: '#7DB8FF', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Avatar avatar={null} name={u.displayName} size={mk(50)} /></View>
            <OutlinedText size={mk(28)} width={mk(2)} align="left" numberOfLines={1} style={{ flex: 1 }}>{u.displayName.toLocaleUpperCase('tr')}</OutlinedText>
            <ChunkyButton kind="blue" label={S.add} height={mk(58)} size={mk(24)} style={{ width: mk(160) }} onPress={() => { actions.sendFriendRequest(undefined, u.displayName); onNotice(S.addFriend, `${u.displayName}: ${S.add} ✓`); }} />
          </Plate>
        ))}
      </View>
      <View style={{ height: mk(30) }} />
    </View>
  );
}
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ marginHorizontal: SIDE, marginTop: mk(20) }}>
      <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={R.plate} inner={{ paddingHorizontal: mk(12), paddingBottom: mk(14) }}>{children}</Plate>
    </View>
  );
}
export { GemAmount, GAP };
