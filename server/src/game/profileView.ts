import { accountLevelFromTotal, copassV2Enabled } from './level.ts';
// UserProfile (DB modeli) → ProfileView (tel protokolü) dönüşümü — TEK kaynak.
// Eskiden ws/server.ts içinde özeldi; room.ts'in de (streak_reward) ihtiyacı
// olunca paylaşılan modüle çıkarıldı. Alan eklerken İKİ tipe birden bak.
import type { ProfileView } from '../protocol.ts';
import type { UserProfile } from './rank.ts';

export function toProfileView(p: UserProfile): ProfileView {
  return {
    userId: p.id,
    displayName: p.displayName,
    trophies: p.trophies,
    diamonds: p.diamonds,
    wins: p.wins,
    losses: p.losses,
    selectedAvatar: p.selectedAvatar,
    ownedAvatars: p.ownedAvatars,
    ownedEmotes: p.ownedEmotes,
    equippedEmotes: p.equippedEmotes,
    usernameSet: p.usernameSet,
    socialPackUntil: p.socialPackUntil,
    outageGiftAt: p.outageGiftAt,
    outageGiftAvailable: p.outageGiftAvailable,
    arena: p.arena,
    avatar: p.avatar,
    xp: p.xp,
    level: p.level,
    // Hesap seviyesi (2026-09-02): sezonluk level'dan bağımsız, ömürlük.
    ...(() => { const h = accountLevelFromTotal(p.totalXp ?? 0); return { accountLevel: h.level, accountXpInto: h.into, accountXpNext: h.next }; })(),
    selectedFrame: p.selectedFrame,
    claimedLevels: p.claimedLevels,
    powerXp2x: p.powerXp2x,
    powerShield: p.powerShield,
    xpBoostUntil: p.xpBoostUntil,
    shieldArmed: p.shieldArmed,
    winStreak: p.winStreak,
    bestStreak: p.bestStreak,
    powerStreak: p.powerStreak,
    lostStreak: p.lostStreak,
    powerTraining: p.powerTraining,
    trainingBoostUntil: p.trainingBoostUntil,
    premiumRoad: p.premiumRoad,
    copassV2: copassV2Enabled(),
    claimedPremium: p.claimedPremium,
    ownedFrames: p.ownedFrames,
    ownedCosmetics: p.ownedCosmetics,
    equippedNameEffectId: p.equippedNameEffectId,
    equippedMatchBackgroundId: p.equippedMatchBackgroundId,
    equippedBallId: p.equippedBallId,
    equippedIntroId: p.equippedIntroId,
    equippedVictoryEffectId: p.equippedVictoryEffectId,
    equippedAnswerEffectId: p.equippedAnswerEffectId,
    highestArenaRewarded: p.highestArenaRewarded,
    spFreeze: p.spFreeze,
    spReveal: p.spReveal,
    spSkip: p.spSkip,
    spExtratime: p.spExtratime,
    spSecondchance: p.spSecondchance,
    equippedSpecialPower: p.equippedSpecialPower,
    equippedSpecialPowers: p.equippedSpecialPowers,
  };
}
