// Client mirror of the server's WebSocket protocol (server/src/protocol.ts).
// Keep these in sync. (Phase 1: duplicated; later we can extract a shared pkg.)

// Günün Crossover'ı — sunucu-otoriter günlük soru durumu.
export interface DailyCrossoverStateView {
  day: number;               // görünen gün numarası (#N, 1'den başlar)
  teamA: ClubRef;
  teamB: ClubRef;
  resetAt: string;           // İstanbul gece yarısı — geri sayım buna kilitlenir
  reward: number;            // doğru bilene 💎
  maxGuesses: number;
  attemptsUsed: number;
  started: boolean;
  played: boolean;           // gün kapandı (doğru ya da haklar bitti)
  streak: number;            // ardışık doğru gün
  result: {
    day: number; correct: boolean; guesses: number; durationMs: number;
    playerName: string | null; playerImage: string | null;
    commonPlayers: { name: string; imageUrl: string | null }[];
  } | null;
}

export interface ClubRef {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface SpellInfo {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  startYear: number | null;
  endYear: number | null;
}

export type VerifyReason = 'both' | 'not_both' | 'no_match' | 'timeout' | 'no_common' | 'same_team' | 'passed' | 'all_wrong' | 'power_skip';

export type RoomStatus = 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result' | 'xox';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type GameMode = 'team-team' | 'country-team' | 'letter-team' | 'player-player' | 'xox';

export type PickRole = 'team' | 'country' | 'letter' | 'player';

export interface PlayerRef {
  id: number;
  name: string;
  imageUrl: string | null;
}

export type Scope =
  | { type: 'all' }
  | { type: 'league'; value: string }
  | { type: 'country'; value: string };

export interface GameOptions {
  scope?: Scope;
  difficulty?: Difficulty;
  mode?: GameMode;
}

export interface ScopeOption {
  value: string;
  displayName?: string;
  count: number;
  logoUrl?: string | null;
}
export interface ScopesList {
  leagues: ScopeOption[];
  countries: ScopeOption[];
  nationalities?: { value: string; count: number }[];
}

export interface ArenaView {
  name: string;
  icon: string;
  minTrophies: number;
}

export interface ProfileView {
  userId: string;
  displayName: string;
  trophies: number;
  diamonds: number;
  wins: number;
  losses: number;
  selectedAvatar: string;
  ownedAvatars: string[];
  ownedEmotes: string[];
  equippedEmotes: string[];
  usernameSet: boolean;
  socialPackUntil: string | null;
  outageGiftAt?: string | null;   // kesinti telafisi alındı damgası (ISO) ya da null
  outageGiftAvailable?: boolean;  // true → kesinti özür penceresi gösterilir ("AL" ile tanımlanır)
  arena: ArenaView;
  avatar: string | null;
  xp: number;    // mevcut seviye içindeki ilerleme
  level: number; // 1..50
  selectedFrame: string | null; // takılı profil çerçevesi (bronze..goat) ya da null
  claimedLevels: number[]; // Seviye Yolu'nda toplanmış ödül seviyeleri
  powerXp2x?: number;       // envanterdeki 2x XP jetonu adedi
  powerShield?: number;     // envanterdeki kupa kalkanı adedi
  xpBoostUntil?: string | null; // aktif 2x XP penceresinin bitişi (ISO) ya da null
  shieldArmed?: boolean;    // kuşanılmış kupa kalkanı
  winStreak?: number;       // güncel dereceli galibiyet serisi
  bestStreak?: number;      // tüm zamanların en yüksek serisi
  powerStreak?: number;     // envanterdeki Seri Geri Yükleme adedi
  lostStreak?: number;      // son mağlubiyette kırılan seri (geri yüklenebilir)
  powerTraining?: number;       // envanterdeki Antrenman Bileti adedi
  trainingBoostUntil?: string | null; // aktif Antrenman Bileti penceresinin bitişi (ISO)
  powerSocialToken?: number;    // envanterdeki Sosyal Paket Jetonu adedi
  premiumRoad?: boolean;    // Premium Seviye Yolu açık mı (sezonluk)
  claimedPremium?: number[]; // Premium şeritte toplanmış ödül seviyeleri
  ownedFrames?: string[];   // KALICI çerçeve sahipliği (sezonlar arası korunur)
  ownedCosmetics?: string[];
  equippedNameEffectId?: string | null;
  equippedMatchBackgroundId?: string | null;
  equippedBallId?: string | null;
  equippedIntroId?: string | null;
  equippedVictoryEffectId?: string | null;
  equippedAnswerEffectId?: string | null;
  highestArenaRewarded?: number; // ulaşılıp açılmış en yüksek arena index'i (0=Mahalle)
  // Maç içi Özel Güç envanteri (maç başına 1 kullanım) + kuşanılmış güç
  spFreeze?: number;
  spReveal?: number;
  spSkip?: number;
  spExtratime?: number;
  spSecondchance?: number;
  equippedSpecialPower?: string | null;
  equippedSpecialPowers?: string[];
}

export interface CosmeticLoadoutView {
  frameId: string | null;
  avatarId: string | null;
  nameEffectId: string | null;
  matchBackgroundId: string | null;
  ballId: string | null;
  introId: string | null;
  victoryEffectId: string | null;
  answerEffectId: string | null;
  emoteIds: string[];
}

export type CosmeticType = 'frame' | 'name_effect' | 'match_background' | 'ball' | 'intro' | 'victory_effect' | 'answer_effect' | 'avatar' | 'emote';
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export interface DailyOfferView {
  key: string;
  kind: 'cosmetic' | 'power_bundle' | 'socialtoken';
  itemId: string;
  qty: number;
  originalPrice: number;
  price: number;
  expiresAt: string;
}

export interface StoreCatalogItem {
  id: string;
  type: CosmeticType | string;
  name: string;
  description: string;
  rarity: CosmeticRarity | string;
  diamondPrice: number;
  isLimited?: boolean;
  availableFrom?: string;
  availableUntil?: string;
}
export interface StoreCatalogView {
  version: number;
  serverTime: string;
  dailyResetAt: string;
  weeklyResetAt: string;
  items: StoreCatalogItem[];
  featured: string[];
  // Maç içi Özel Güç fiyat/rarity kataloğu (sunucu config'i — istemci hardcode etmez).
  specialPowers?: { id: string; rarity: string; price: number }[];
  // KASA: bu haftanın limitli mythic düşüşü + vitrinden kalkacağı an (geri sayım).
  // Mythic'ler yalnız kasadan çıktıkları hafta satın alınabilir (sunucu uygular).
  vaultItemId?: string;
  vaultUntil?: string;
  // Bu kullanıcı ilk elmas paketinde 2x hakkını henüz kullanmadı (rozet gösterilir).
  firstDiamondDoubleAvailable?: boolean;
}

export interface FriendView {
  userId: string;
  displayName: string;
  selectedAvatar: string;
  trophies: number;
  arena: ArenaView;
  online: boolean;
  avatar?: string | null;
  frame?: string | null; // takılı profil çerçevesi
  lastSeen?: string | null;
}

export interface FriendRequestView {
  requestId: string;
  fromId: string;
  fromName: string;
  createdAt: string;
}

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  wrongCount: number;
  isHost: boolean;
  connected: boolean;
  isBot?: boolean;
  trophies?: number;
  arena?: ArenaView;
  avatar?: string | null;
  level?: number; // eşleşme kartındaki seviye rozeti
  frame?: string | null; // takılı profil çerçevesi — rakip de görür
  cosmetics?: CosmeticLoadoutView;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  players: PlayerView[];
  youId: string;
}

export interface RoundResult {
  correct: boolean;
  reason: VerifyReason;
  autocorrected: boolean;
  answeredById: string | null;
  answeredByName: string | null;
  guess: string;
  teamA: ClubRef;
  teamB: ClubRef;
  matchedPlayerName: string | null;
  matchedPlayerImageUrl: string | null;
  matchedClubName?: string | null;
  matchedClubLogo?: string | null;
  spellsA: SpellInfo[];
  spellsB: SpellInfo[];
  allClubs: SpellInfo[];
  commonPlayers: { name: string; imageUrl: string | null }[];
}

export type ClientMsg =
  // caps bağlantı-kuran DÖRT maç mesajında da taşınır (create_room/create_solo/
  // join_room/find_match): maç soketleri taze açılır, register buradan geçmez —
  // caps yalnız kayıt mesajlarında kalınca wrongopen dereceli maçta hiç açılmıyordu.
  | { type: 'create_room'; name: string; userId?: string; options?: GameOptions; caps?: string[] }
  | { type: 'create_solo'; name: string; userId?: string; options?: GameOptions; caps?: string[] }
  | { type: 'join_room'; code: string; name: string; userId?: string; caps?: string[] }
  // caps: istemci yetenek bayrakları — 'wrongopen' = yanlış cevapta turun rakibe
  // açılmasını (wrong_guess/guess_denied) anlar. useCrossover kayıt mesajlarına ekler.
  | { type: 'resume_room'; code: string; userId: string; caps?: string[] }
  | { type: 'register'; name: string; gameCenterId?: string; userId?: string; caps?: string[] }
  | { type: 'guest'; caps?: string[] } // guest login → server creates an account with an auto "M"+9-digit username
  | { type: 'auth'; provider: 'apple' | 'google' | 'facebook'; token: string; name?: string; userId?: string; caps?: string[] }
  | { type: 'change_name'; newName: string }
  | { type: 'set_username'; username: string; userId?: string }
  | { type: 'find_match'; name?: string; userId?: string; options?: GameOptions; caps?: string[] }
  | { type: 'start' }
  | { type: 'pick_team'; clubId: number }
  | { type: 'pick_country'; country: string }
  | { type: 'pick_letter'; letter: string }
  | { type: 'submit_guess'; text: string }
  | { type: 'pass' }
  | { type: 'ready' }
  | { type: 'play_again' }
  | { type: 'rematch_response'; accept: boolean }
  | { type: 'send_emote'; emoteId: string }
  | { type: 'buy_emote'; emoteId: string }
  | { type: 'equip_emotes'; emoteIds: string[] }
  | { type: 'buy_avatar'; avatarId: string }
  | { type: 'buy_cosmetic'; itemId: string; idempotencyKey?: string }
  | { type: 'equip_cosmetic'; itemId: string | null; cosmeticType: 'frame' | 'name_effect' | 'match_background' | 'ball' | 'intro' | 'victory_effect' | 'answer_effect' }
  | { type: 'get_store_catalog' }
  | { type: 'set_avatar'; avatar: string | null }
  | { type: 'set_frame'; frameId: string | null }
  | { type: 'claim_level_reward'; level: number; track?: 'free' | 'premium' } // Seviye Yolu kartına dokunarak ödül topla (şerit seçimiyle)
  | { type: 'buy_premium_road' } // Premium Seviye Yolu'nu 1000 elmasla aç
  | { type: 'buy_power'; powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken' } // mağazadan güç satın al
  | { type: 'use_power'; powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken' } // envanterdeki tek kullanımlık gücü etkinleştir
  | { type: 'claim_outage_gift' } // kesinti telafisi: özür penceresindeki "AL"
  | { type: 'get_daily_offer' } // kişiye özel 12 saatlik fırsat
  | { type: 'buy_daily_offer'; key: string }
  | { type: 'redeem_referral'; code: string } // davet kodu gir (yeni hesap; ikisi de 💎 kazanır)
  | { type: 'get_daily_crossover' } // Günün Crossover'ı durumunu iste
  | { type: 'start_daily_crossover' } // soruyu açtım — süre sayacı sunucuda başlar (idempotent)
  | { type: 'daily_crossover_guess'; text: string } // günlük tahmin (3 hak, sunucu sayar)
  | { type: 'get_my_stats' } // profil istatistikleri: seri rekoru + mod bazlı K/M
  | { type: 'verify_purchase'; receipt: string }
  | { type: 'grant_ad_reward' }
  | { type: 'search_clubs'; reqId: string; q: string }
  | { type: 'pick_player'; playerId: number }
  | { type: 'search_players'; q: string }
  | { type: 'send_friend_request'; targetCode?: string; targetUsername?: string }
  | { type: 'respond_friend_request'; requestId: string; accept: boolean }
  | { type: 'list_friends' }
  | { type: 'search_users'; query: string }
  | { type: 'remove_friend'; friendId: string }
  | { type: 'invite_friend_match'; friendId: string; options?: GameOptions }
  | { type: 'respond_match_invite'; fromId: string; accept: boolean }
  | { type: 'cancel_match_invite'; toId: string }
  | { type: 'get_user_profile'; userId: string }
  | { type: 'list_match_history' }
  | { type: 'send_message'; toUserId: string; body: string }
  | { type: 'list_messages'; withUserId: string; before?: string }
  | { type: 'list_conversations' }
  | { type: 'mark_read'; fromUserId: string }
  | { type: 'typing_start'; toUserId: string }
  | { type: 'typing_stop'; toUserId: string }
  // ---- User-generated-content safety (App Store guideline 1.2) ----
  | { type: 'block_user'; userId: string }
  | { type: 'unblock_user'; userId: string }
  | { type: 'list_blocked' }
  // messageId omitted → reporting the USER rather than one message.
  | { type: 'report_content'; userId: string; reason: string; messageId?: string }
  | { type: 'delete_message'; messageId: string } // remove your OWN message
  | { type: 'accept_terms' }                      // EULA agreement, recorded server-side
  | { type: 'register_push'; token: string; platform: 'ios' | 'android'; lang?: string }
  // Permanently delete the signed-in account and all its data (App Store 5.1.1(v)).
  | { type: 'delete_account' }
  // Deliberate match exit: skips reconnect grace and lets the opponent see forfeit immediately.
  | { type: 'leave_match'; reason?: 'leave' | 'cheat' }
  | { type: 'ack_support_message'; id: string }
  | { type: 'list_tournaments' }
  | { type: 'get_league' }
  | { type: 'join_tournament'; id: string }
  | { type: 'leave_tournament'; id: string }
  | { type: 'get_tournament'; id: string }
  | { type: 'tournament_ready'; matchId: string } // turnuva maçına 'hazırım' — iki taraf da deyince oda kurulur
  // ---- Maç içi Özel Güçler (server-authoritative; maç başına TEK kullanım) ----
  | { type: 'use_special_power'; powerId: string; requestId: string }
  | { type: 'equip_special_power'; powerId: string | null }
  | { type: 'buy_special_power'; powerId: string; qty?: number }
  // ---- Futbol XOX (Tiki-Taka-Toe) ----
  // Sıra sende + hücre açıkken: hücre (0-8, satır-major) + futbolcu adı.
  // Ani ölümde (suddenDeath) cell = suddenCell olmalı; iki taraf da yarışır.
  | { type: 'xox_submit'; cell: number; text: string };

export type ServerMsg =
  | { type: 'room_state'; room: RoomView }
  | { type: 'profile'; profile: ProfileView }
  | { type: 'name_changed'; profile: ProfileView }
  | { type: 'countdown'; n: number; endsAt?: number } // endsAt: paylaşılan mutlak bitiş — istemci sayıyı ondan hesaplar
  | { type: 'pick_phase'; endsAt: number; pickRole?: PickRole; usedClubIds?: number[]; usedCountries?: string[] } // maç boyu seçilmiş takım/ülkeler (karart+kilitle)
  | { type: 'team_picked'; playerId: string }
  | { type: 'reveal_teams'; teamA: ClubRef; teamB: ClubRef; mode?: GameMode; country?: string; letter?: string }
  | { type: 'guess_phase'; endsAt: number }
  // wrongopen kuralı: yanlış cevap turu yakmaz — yazan susturulur, rakip devam eder.
  // wrongCount oyuncunun maçtaki toplam yanlış sayısıdır; maç sonucunu tek başına belirlemez.
  // retryAt: yanlış yazana tanınan İKİNCİ HAK penceresinin açıldığı an (epoch ms).
  // İlk yanlışta her insan oyuncuya dolu gelir (server-authoritative — caps'siz
  // eski istemci de aynı hakkı alır, kullanıcı raporu 2026-08-19).
  | { type: 'wrong_guess'; byId: string; byName: string; guess: string; wrongCount: number; retryAt?: number }
  | { type: 'guess_denied'; reason: 'too_late' | 'burned' | 'cooldown' | 'frozen' | 'expired' }
  | { type: 'pass_locked'; byId: string; byName: string }
  // ---- Maç içi Özel Güçler ----
  | { type: 'special_power_state'; enabled: boolean; you: { powerId: string | null; qty: number; used: boolean; usedPowerId: string | null }; opponentUsedPowerId: string | null; config: { freezeMs: number; extraTimeMs: number }; activeFreezeUntil?: number; yourDeadline?: number; slots?: { powerId: string; qty: number; used: boolean }[]; usedTotal?: number; maxPerMatch?: number }
  | { type: 'special_power_activated'; byId: string; byName: string; powerId: string; roundNumber: number; serverNow: number; effect?: { targetId?: string; freezeUntil?: number; newDeadline?: number } }
  | { type: 'special_power_reveal'; playerName: string; imageUrl: string | null }
  | { type: 'special_power_effect'; kind: 'second_chance_triggered'; byId: string; byName: string }
  | { type: 'special_power_denied'; reason: 'already_used' | 'no_inventory' | 'round_not_active' | 'match_over' | 'too_late' | 'unavailable' | 'invalid'; requestId?: string }
  | { type: 'special_power_equipped'; powerId: string | null; profile: ProfileView }
  | { type: 'special_power_purchased'; powerId: string; profile: ProfileView }
  | { type: 'streak_reward'; streak: number; diamonds: number; powerId: string | null; profile: ProfileView }
  // ---- Futbol XOX (Tiki-Taka-Toe) — sunucu-otoriter 3×3 durum ----
  // Her hamle/zaman aşımı sonrası TAM durum yayınlanır: iki istemci aynı
  // kaynaktan çizer (desync imkânsız). lastAction sunum katmanı içindir.
  | { type: 'xox_state'; rows: ClubRef[]; cols: ClubRef[]; cells: { owner: string | null; playerName: string | null; playerImageUrl: string | null }[]; turnId: string | null; turnEndsAt: number; turnNumber: number; turnCap: number; suddenDeath: boolean; suddenCell: number | null; lastAction?: { kind: 'claim' | 'wrong' | 'timeout'; byId: string; byName: string; cell?: number; guess?: string; playerName?: string } }
  // Maç bitti: line = kazanan 3'lü (hücre indeksleri) ya da null (çoğunluk/tie-break).
  | { type: 'xox_over'; winnerId: string | null; winnerName: string | null; line: number[] | null; reason: 'line' | 'majority' | 'sudden_death' | 'tiebreak' | 'draw'; emptyReveal?: { cell: number; playerName: string; playerImageUrl: string | null }[] }
  | {
      type: 'result';
      result: RoundResult;
      players: PlayerView[];
      matchOver: boolean;
      winnerId: string | null;
      winnerName: string | null;
      target: number;
    }
  | { type: 'waiting_ready' }
  | { type: 'ready_countdown'; endsAt: number }
  | { type: 'player_ready'; playerId: string }
  | { type: 'rematch_requested'; byId: string; byName: string }
  | { type: 'rematch_waiting' }
  | { type: 'rematch_declined' }
  | { type: 'trophy_update'; matchId?: string; trophies: number; delta: number; arena: ArenaView; diamonds?: number; arenaReward?: number; highestArenaRewarded?: number; shielded?: boolean; winStreak?: number; bestStreak?: number; lostStreak?: number } // shielded: Kupa Kalkanı kupa kaybını emdi; lostStreak: geri yüklenebilir kırık seri (maç sonrası 0)
  | { type: 'xp_update'; xp: number; level: number; xpForNext: number; gained: number; leveledUp: { level: number; diamonds: number; emoteId?: string; powerId?: string }[]; diamonds?: number; boosted?: boolean }
  | { type: 'level_reward_claimed'; level: number; diamonds: number; emoteId: string | null; frameTier: string | null; powerId?: string | null; track?: 'free' | 'premium'; profile: ProfileView } // yol kartından ödül toplandı
  | { type: 'premium_road_purchased'; profile: ProfileView } // Premium Yol açıldı
  | { type: 'power_purchased'; powerId: string; profile: ProfileView } // mağazadan güç alındı
  | { type: 'power_used'; powerId: string; profile: ProfileView } // güç etkinleştirildi
  | { type: 'outage_gift_claimed'; profile: ProfileView; granted: boolean } // granted=false → zaten alınmıştı
  | { type: 'daily_offer'; offer: DailyOfferView | null }
  | { type: 'daily_offer_purchased'; profile: ProfileView; offer: DailyOfferView }
  | { type: 'referral_redeemed'; profile: ProfileView; referrerName: string; reward: number }
  // Günün Crossover'ı — state hem ilk açılışta hem bitişte aynı şekilde gelir.
  | { type: 'daily_crossover'; state: DailyCrossoverStateView }
  | { type: 'daily_crossover_wrong'; guess: string; suggestion: string | null; attemptsLeft: number }
  | { type: 'daily_crossover_done'; state: DailyCrossoverStateView; rewardGranted: number; profile?: ProfileView }
  | { type: 'my_stats'; winStreak: number; bestStreak: number; wins: number; losses: number; modes: { mode: string; wins: number; losses: number }[] } // profil istatistikleri: sadece ranked hızlı eşleşme
  | { type: 'emote'; fromId: string; emoteId: string }
  | { type: 'emote_purchased'; profile: ProfileView; emoteId: string }
  | { type: 'avatar_purchased'; profile: ProfileView; avatarId: string }
  | { type: 'store_catalog'; catalog: StoreCatalogView }
  | { type: 'cosmetic_purchased'; profile: ProfileView; itemId: string; alreadyOwned?: boolean }
  | { type: 'cosmetic_equipped'; profile: ProfileView; itemId: string | null; cosmeticType: string }
  | { type: 'diamonds_granted'; profile: ProfileView; granted: number }
  | { type: 'ad_reward_result'; ok: boolean; granted?: number; profile?: ProfileView; error?: string }
  | { type: 'club_results'; reqId: string; clubs: ClubRef[] }
  | { type: 'player_results'; players: PlayerRef[] }
  | { type: 'searching'; etaSeconds?: number } // tahmini eşleşme süresi (dürüst: fallback zamanından türetilir)
  | { type: 'support_message'; id: string; title?: string | null; body: string } // hedefli destek/duyuru popup'ı
  | { type: 'tournaments_list'; items: { id: string; name: string; size: number; joined: number; youJoined: boolean; status: 'registration' | 'live' | 'finished'; prizeFirst: number; prizeSecond: number; entryFee: number; winnerName?: string | null }[] }
  | { type: 'league_state'; league: { tier: number; tierName: string; weekKey: string; endsAt: string; yourRank: number; yourPoints: number; groupSize: number; promoteCount: number; demoteCount: number; rows: { rank: number; name: string; points: number; isYou: boolean; isBot: boolean; avatar: string | null; zone: 'promote' | 'demote' | 'stay' }[]; lastResult: { weekKey: string; rank: number; points: number; tierBefore: number; tierAfter: number } | null } }
  | { type: 'tournament_state'; tournament: { id: string; name: string; size: number; status: 'registration' | 'live' | 'finished'; prizeFirst: number; prizeSecond: number; entryFee: number; joined: number; youJoined: boolean; players: { userId: string; name: string }[]; matches: { id: string; round: number; slot: number; aId: string | null; aName: string | null; bId: string | null; bName: string | null; winnerId: string | null; status: string }[]; winnerName: string | null } }
  | { type: 'tournament_match_ready'; tournamentId: string; matchId: string; opponentName: string; tournamentName: string; youReady?: boolean; oppReady?: boolean } // maç oynanabilir — iki taraf da hazır deyince başlar
  | { type: 'tournament_over'; tournamentId: string; youWon: boolean; placement: number; prize: number; tournamentName: string }
  | { type: 'opponent_left'; forfeit?: boolean; forfeitReason?: 'cheat' }
  | { type: 'friend_request_received'; requestId: string; fromId: string; fromName: string }
  | { type: 'friend_request_sent' }
  | { type: 'friend_request_responded'; requestId: string; accepted: boolean }
  | { type: 'friends_list'; friends: FriendView[]; requests: FriendRequestView[] }
  | { type: 'user_search_results'; users: { userId: string; displayName: string }[] }
  | { type: 'friend_removed'; friendId: string }
  | { type: 'match_invite_received'; fromId: string; fromName: string; options?: GameOptions }
  | { type: 'match_invite_declined'; byId: string }
  | { type: 'match_invite_cancelled' }
  | { type: 'user_profile'; profile: PublicProfile }
  | { type: 'match_history_list'; matches: MatchHistoryView[] }
  | { type: 'message_received'; message: MessageView }
  | { type: 'message_list'; messages: MessageView[]; withUserId: string }
  | { type: 'conversation_list'; conversations: ConversationView[] }
  | { type: 'messages_marked_read'; fromUserId: string }
  | { type: 'typing'; fromUserId: string; isTyping: boolean }
  | { type: 'account_deleted' } // account permanently deleted — client wipes local state
  // ---- User-generated-content safety (App Store guideline 1.2) ----
  | { type: 'blocked_list'; users: BlockedUserView[] }
  | { type: 'user_blocked'; userId: string }
  | { type: 'user_unblocked'; userId: string }
  | { type: 'report_filed' }                          // report accepted — show the 24h notice
  | { type: 'message_deleted'; messageId: string }    // sent to BOTH sides of the chat
  | { type: 'error'; message: string; code?: string; public?: boolean };

export interface BlockedUserView {
  userId: string;
  displayName: string;
  avatar: string | null;
}

export interface MessageView {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  body: string;
  createdAt: string;
  deleted?: boolean; // sender removed it — render a placeholder, not the text
}

export interface ConversationView {
  userId: string;
  displayName: string;
  selectedAvatar?: string;
  online: boolean;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  avatar?: string | null;
  frame?: string | null; // takılı profil çerçevesi
}

export interface PublicProfile {
  userId: string;
  displayName: string;
  selectedAvatar: string;
  trophies: number;
  wins: number;
  losses: number;
  arena: ArenaView;
  avatar?: string | null;
  frame?: string | null; // takılı profil çerçevesi
  bestStreak?: number;
  modes?: { mode: string; wins: number; losses: number }[];
  isBot?: boolean;
  modeStats?: { mode: string; wins: number; losses: number }[];
}

export interface MatchHistoryView {
  id: string;
  playerName: string;
  opponentName: string;
  playerScore: number;
  opponentScore: number;
  won: boolean;
  playerTrophies: number;
  opponentTrophies: number;
  gameMode: string;
  rounds: {
    teamA: string; teamALogo: string | null;
    teamB: string; teamBLogo: string | null;
    player: string; playerImageUrl: string | null;
    answeredBy: string;
    mode?: string; country?: string; letter?: string;
  }[];
  playedAt: string;
}
