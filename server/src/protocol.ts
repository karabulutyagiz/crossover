// WebSocket message protocol shared between the game server and clients.
// JSON messages discriminated by `type`. (The RN app mirrors these types.)

import type { SpellInfo, VerifyReason } from './game/verify.ts';

export interface ClubRef {
  id: number;
  name: string;
  logoUrl: string | null;
  // XOX ekseni KULÜP yerine ÜLKE / (büyük) LİG / TEKNİK DİREKTÖR olabilir (2026-08-29).
  // kind==='country': logoUrl null, bayrak `flag` emojisinde, `country` ham milliyet.
  // kind==='league': logoUrl lig logosu (resim), `league` büyük lig kodu ('ES1'…).
  // kind==='manager': logoUrl TD fotosu (resim), `manager` TM trainer id.
  // kind==='trophy': `trophy` kupa kodu ('CL'|'WC'|'EL') — client yerel görselle çizer.
  // kind==='position': `position` mevki kodu ('GK'|'CB'|…) — client BÜYÜK harf metin.
  // kind==='bdor': Ballon d'Or — client yerel görselle çizer.
  // kind==='combo': birleşik logo (iki takım) — client yerel görselle çizer;
  //   `combo` KEY'i ('BARCA_REAL'|'BAYERN_DORTMUND'|'CITY_UNITED'). Hücre = İKİ
  //   takımda DA oynamış (+ diğer eksen) oyuncu.
  // Diğer tüm kullanımlarda bu alanlar undefined kalır (yalnız xox_state doldurur).
  kind?: 'club' | 'country' | 'league' | 'manager' | 'trophy' | 'position' | 'bdor' | 'combo';
  country?: string;
  flag?: string;
  league?: string;
  manager?: number;
  trophy?: string;
  position?: string;
  combo?: string;
  comboA?: number;
  comboB?: number;
}

// Günün Crossover'ı — sunucu-otoriter günlük soru durumu (game/dailyCrossover.ts üretir).
export interface DailyCrossoverStateView {
  day: number;               // görünen gün numarası (#N, 1'den başlar)
  // Soru TÜRÜ gün-paritesiyle değişir (kullanıcı kararı 2026-08-31): 'crossover' =
  // iki takımda oynamış oyuncu; 'scramble' = Çöz Kazan (karışık harfli oyuncu).
  // Sistem/ödül AYNI (10 💎, 3 hak). scramble günlerinde teamA/teamB yok, scramble dolu.
  kind: 'crossover' | 'scramble';
  teamA?: ClubRef;
  teamB?: ClubRef;
  scramble?: { letters: string[] }; // karışık kelimeler (BÜYÜK harf), yalnız scramble günü
  resetAt: string;           // İstanbul gece yarısı — istemci geri sayımı buna kilitlenir
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

export interface DailyCareerStepView {
  order: number;
  clubName: string;          // açılmamış adımda BOŞ (sızıntı yok)
  clubLogo: string | null;
  years: string;
  revealed: boolean;
}

export interface DailyCareerStateView {
  day: number;
  resetAt: string;
  reward: number;
  maxGuesses: number;
  attemptsUsed: number;
  revealed: number;
  totalSteps: number;
  steps: DailyCareerStepView[];
  played: boolean;
  correct: boolean;
  answer: { name: string; imageUrl: string | null; nationality: string | null } | null;
}

export interface DailyQuestView {
  id: string;
  titleKey: string;
  target: number;
  progress: number;
  xp: number;
  done: boolean;
  claimed: boolean;
}

export interface DailyQuestsView {
  day: number;
  resetAt: string;
  quests: DailyQuestView[];
}

export interface SeasonStateView {
  seasonId: string;
  endsAt: string;
  peakTrophies: number;
  peakArenaName: string;
  wins: number;
  losses: number;
  last: { seasonId: string; peakTrophies: number; peakArenaName: string; wins: number; losses: number } | null;
}

export type RoomStatus = 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result' | 'xox' | 'cozkazan' | 'guesswho';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Game mode: determines what each player picks and how the guess is verified.
export type GameMode = 'team-team' | 'country-team' | 'letter-team' | 'player-player' | 'xox' | 'cozkazan' | 'guess-who';

// ── "Ben Kimim?" modu tipleri ──────────────────────────────────────────────
// Bir tahmin niteliği: değer + eşleşti mi (yeşil/kırmızı) + sayısalsa ok yönü
// (hedef DAHA BÜYÜKSE 'up' ↑, daha küçükse 'down' ↓).
export interface GwCmp { value: string | number | null; match: boolean; dir?: 'up' | 'down' }
// Bir tahmin satırı: tahmin edilen oyuncu + her niteliğin hedefle kıyası.
export interface GwRow {
  playerId: number; name: string; imageUrl: string | null; correct: boolean;
  club: GwCmp & { logo: string | null };
  nationality: GwCmp; age: GwCmp; jersey: GwCmp; position: GwCmp;
  league: GwCmp & { logo: string | null };
}
// Maç sonu hedefin açığa çıkan kartı.
export interface GwReveal {
  playerId: number; name: string; imageUrl: string | null;
  clubName: string | null; clubLogo: string | null; nationality: string | null;
  age: number | null; jersey: number | null; position: string | null; league: string | null; leagueLogo: string | null;
}

// What a player should pick during the pick phase.
export type PickRole = 'team' | 'country' | 'letter' | 'player';

export interface PlayerRef {
  id: number;
  name: string;
  imageUrl: string | null;
}

// Which clubs are allowed in a game.
export type Scope =
  | { type: 'all' }
  | { type: 'league'; value: string }
  | { type: 'country'; value: string };

export interface GameOptions {
  scope?: Scope;
  difficulty?: Difficulty; // bot difficulty (solo only)
  mode?: GameMode;         // game mode (default: 'team-team')
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
  socialPackUntil: string | null; // ISO date or null
  outageGiftAt?: string | null;      // 5 Eylül bakım telafisi alındı damgası (ISO) ya da null
  outageGiftAvailable?: boolean;     // cutoff öncesi hesap + henüz alınmadı → 150 elmas popup'ı
  arena: ArenaView;
  avatar: string | null; // chosen profile-picture id (e.g. 'pp7') or null
  xp: number;    // mevcut seviye içindeki ilerleme (SEZONLUK)
  level: number; // 1..50 sezon seviyesi (CO-PASS yolu)
  // Hesap seviyesi — ömürlük, sezon devrinde SIFIRLANMAZ (LoL usulü, 2026-09-02).
  accountLevel?: number;
  accountXpInto?: number;
  accountXpNext?: number;
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
  copassV2?: boolean;       // CO-PASS v2 açık mı (50 seviyenin HER BİRİNDE ödül).
                            // İstemci ödül ızgarasını buna göre çizer; bayrak
                            // kapalıyken eski (yalnız ×5) düzen gösterilir.
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
  level?: number; // eşleşme kartındaki seviye rozeti için
  frame?: string | null; // takılı profil çerçevesi — rakip de görür
  cosmetics?: CosmeticLoadoutView;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  players: PlayerView[];
  youId: string;
}

// ---- Client -> Server ----
export type ClientMsg =
  | { type: 'app_state'; state: 'active' | 'background' }
  | { type: 'create_room'; name: string; userId?: string; options?: GameOptions; caps?: string[] }
  | { type: 'create_solo'; name: string; userId?: string; options?: GameOptions; caps?: string[] }
  | { type: 'join_room'; code: string; name: string; userId?: string; caps?: string[] }
  // caps: istemci yetenek bayrakları ('wrongopen' = yanlış cevapta turun rakibe
  // açılmasını ve wrong_guess/guess_denied mesajlarını anlar). Eski istemciler
  // göndermez → sunucu o odalarda eski (kilitli) kuralı uygular.
  | { type: 'resume_room'; code: string; userId: string; caps?: string[] } // reconnect a dropped player during grace period
  | { type: 'register'; name: string; gameCenterId?: string; userId?: string; caps?: string[] }
  // NOT: caps bağlantı-kuran DÖRT mesajda da taşınır (find_match/create_room/
  // create_solo/join_room) — maç soketleri taze açıldığı için register'daki
  // bayraklar onlara ulaşmıyordu ve wrongopen dereceli maçlarda hiç açılmıyordu.
  | { type: 'guest'; caps?: string[] } // guest login → server creates an account with an auto "M"+9-digit username
  | { type: 'auth'; provider: 'apple' | 'google' | 'facebook'; token: string; name?: string; userId?: string; caps?: string[] }
  | { type: 'change_name'; newName: string }
  | { type: 'set_username'; username: string; userId?: string } // one-time unique username after sign-in
  | { type: 'find_match'; name?: string; userId?: string; options?: GameOptions; caps?: string[] } // ranked matchmaking
  | { type: 'start' }
  | { type: 'pick_team'; clubId: number }
  | { type: 'pick_country'; country: string }  // country-team mode: pick a nationality
  | { type: 'pick_letter'; letter: string }     // letter-team mode: pick a letter (A-Z)
  | { type: 'submit_guess'; text: string }
  | { type: 'pass' } // skip this round; if both players pass, the round is voided (no points)
  | { type: 'ready' } // ready for next round
  | { type: 'play_again' } // request a rematch after the match ends
  | { type: 'rematch_response'; accept: boolean }
  | { type: 'send_emote'; emoteId: string } // show an emote to the opponent during a match
  | { type: 'buy_emote'; emoteId: string } // purchase a premium emote with diamonds
  | { type: 'equip_emotes'; emoteIds: string[] } // set the match loadout (max 8 stickers)
  | { type: 'buy_avatar'; avatarId: string } // purchase a premium profile avatar with diamonds
  | { type: 'buy_cosmetic'; itemId: string; idempotencyKey?: string }
  | { type: 'equip_cosmetic'; itemId: string | null; cosmeticType: 'frame' | 'name_effect' | 'match_background' | 'ball' | 'intro' | 'victory_effect' | 'answer_effect' }
  | { type: 'get_store_catalog' }
  | { type: 'set_avatar'; avatar: string | null } // choose/select profile picture ('pp7' or null)
  | { type: 'set_frame'; frameId: string | null }
  | { type: 'claim_season_reward' } // sezon ödülünü topla
  | { type: 'claim_level_reward'; level: number; track?: 'free' | 'premium' } // Seviye Yolu kartına dokunarak ödül topla (şerit seçimiyle)
  | { type: 'buy_premium_road' } // Premium Seviye Yolu'nu 1000 elmasla aç
  | { type: 'buy_power'; powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken' } // mağazadan güç satın al
  | { type: 'use_power'; powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken' } // envanterdeki tek kullanımlık gücü etkinleştir
  | { type: 'claim_outage_gift' } // 5 Eylül bakım telafisi: 150 elması topla
  | { type: 'get_daily_offer' } // kişiye özel 12 saatlik fırsatı iste
  | { type: 'buy_daily_offer'; key: string } // fırsatı satın al (key pencereyle doğrulanır)
  | { type: 'redeem_referral'; code: string } // davet kodu gir (yeni hesap; ikisi de 💎 kazanır)
  | { type: 'get_daily_crossover' } // Günün Crossover'ı durumunu iste
  | { type: 'get_daily_career' }
  | { type: 'get_daily_quests' }
  | { type: 'get_season' }
  | { type: 'freeze_report'; kind: 'jank' | 'dirty_exit'; screen: string; stalledMs: number }
  | { type: 'claim_quest'; questId: string }
  | { type: 'daily_career_guess'; text: string }
  | { type: 'start_daily_crossover' } // soruyu açtım — süre sayacı sunucuda başlar (idempotent)
  | { type: 'daily_crossover_guess'; text: string } // günlük tahmin (3 hak, sunucu sayar)
  | { type: 'get_my_stats' } // profil istatistikleri: seri rekoru + mod bazlı K/M
  | { type: 'verify_purchase'; receipt: string; platform?: 'ios' | 'android'; productId?: string; isSubscription?: boolean } // Apple JWS ya da Google purchaseToken → hak/elmas ver
  | { type: 'grant_ad_reward' } // watched a rewarded ad → credit a few diamonds (capped server-side)
  | { type: 'search_clubs'; reqId: string; q: string }
  | { type: 'pick_player'; playerId: number }
  | { type: 'search_players'; q: string }
  // ---- Friends ----
  | { type: 'send_friend_request'; targetCode?: string; targetUsername?: string }
  | { type: 'respond_friend_request'; requestId: string; accept: boolean }
  | { type: 'list_friends' }
  | { type: 'search_users'; query: string }
  | { type: 'remove_friend'; friendId: string }
  | { type: 'invite_friend_match'; friendId: string; options?: GameOptions }
  | { type: 'respond_match_invite'; fromId: string; accept: boolean } // accept/decline a friend's match invite
  | { type: 'cancel_match_invite'; toId: string } // inviter cancels (or 30s timeout)
  | { type: 'get_user_profile'; userId: string } // view a friend's public profile
  | { type: 'list_match_history' }
  // ---- Direct Messages ----
  | { type: 'send_message'; toUserId: string; body: string }
  | { type: 'list_messages'; withUserId: string; before?: string }
  | { type: 'list_conversations' }           // get all chats with last message + unread count
  | { type: 'mark_read'; fromUserId: string } // mark all messages from this user as read
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
  // ---- Push notifications ----
  // Save this device's Expo push token (client mirror must stay in sync).
  | { type: 'register_push'; token: string; platform: 'ios' | 'android'; lang?: string }
  // Permanently delete the signed-in account and all its data (App Store 5.1.1(v)).
  | { type: 'delete_account' }
  // Bilinçli maç terki (X onayı / arka plan hükmeni): reconnect grace atlanır,
  // rakip hükmen sonucu ANINDA görür.
  | { type: 'leave_match'; reason?: 'leave' | 'cheat' }
  | { type: 'ack_support_message'; id: string }
  | { type: 'list_tournaments' }
  | { type: 'get_league' }
  | { type: 'join_tournament'; id: string }
  | { type: 'leave_tournament'; id: string }
  | { type: 'get_tournament'; id: string }
  | { type: 'tournament_ready'; matchId: string } // turnuva maçına 'hazırım' — iki taraf da deyince oda kurulur
  // ---- Maç içi Özel Güçler (server-authoritative; maç başına TEK kullanım) ----
  // requestId: idempotency anahtarı — aynı istek iki kez tüketmez. powerId,
  // sunucudaki maç-başı anlık görüntüyle birebir tutmalıdır (uyuşmazlık = reddet).
  | { type: 'use_special_power'; powerId: string; requestId: string }
  // Maç dışı: hangi özel güçle maça çıkılacağını seç (null = otomatik).
  | { type: 'equip_special_power'; powerId: string | null }
  // Mağaza: elmasla özel güç satın al (fiyat sunucu kataloğundan).
  | { type: 'buy_special_power'; powerId: string; qty?: number }
  // ---- Futbol XOX (Tiki-Taka-Toe) ----
  // Sıra sende + hücre açıkken: hücre (0-8, satır-major) + futbolcu adı.
  // Ani ölümde (suddenDeath) cell = suddenCell olmalı; iki taraf da yarışır.
  | { type: 'xox_submit'; cell: number; text: string }
  // ---- Çöz Kazan (anagram yarışı): karışık harfli oyuncuyu ilk bilen kazanır ----
  | { type: 'cozkazan_submit'; text: string }
  | { type: 'cozkazan_hint' } // elmas karşılığı bir sonraki doğru harfi aç
  | { type: 'guesswho_submit'; playerId: number }; // "Ben Kimim?": havuzdan seçilen oyuncuyu tahmin et

// ---- Server -> Client ----
export interface RoundResult {
  correct: boolean;
  reason: VerifyReason | 'timeout' | 'no_common' | 'same_team' | 'passed' | 'all_wrong' | 'power_skip';
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

export type ServerMsg =
  | { type: 'room_state'; room: RoomView }
  | { type: 'profile'; profile: ProfileView }
  | { type: 'name_changed'; profile: ProfileView }
  | { type: 'countdown'; n: number; endsAt?: number } // endsAt: paylaşılan mutlak bitiş — istemci sayıyı ondan hesaplar
  | { type: 'pick_phase'; endsAt: number; pickRole?: PickRole; usedClubIds?: number[]; usedCountries?: string[] } // maç boyu seçilmiş takım/ülkeler (karart+kilitle)
  | { type: 'team_picked'; playerId: string }
  | { type: 'reveal_teams'; teamA: ClubRef; teamB: ClubRef; mode?: GameMode; country?: string; letter?: string }
  | { type: 'guess_phase'; endsAt: number }
  // Yeni kural (wrongopen odaları): yanlış cevap turu YAKMAZ — yazan susturulur,
  // rakibin kilidi açılır. wrongCount o oyuncunun maçtaki toplam yanlış sayısıdır.
  // retryAt: yanlış yazana tanınan İKİNCİ HAK penceresinin açıldığı an (epoch ms).
  // İlk yanlışta HER insan oyuncuya dolu gelir (kural server-authoritative'dir,
  // istemci 'wrongretry' bildirmese de — kullanıcı raporu 2026-08-19); yoksa
  // yazan bu tur için kesin susturulmuştur (bot / süre dibi / ikinci yanlış).
  | { type: 'wrong_guess'; byId: string; byName: string; guess: string; wrongCount: number; retryAt?: number }
  // Kişiye özel ret: 'too_late' = rakip senden önce gönderdi; 'burned' = bu turda hakkın bitti.
  | { type: 'guess_denied'; reason: 'too_late' | 'burned' | 'cooldown' | 'frozen' | 'expired' }
  | { type: 'pass_locked'; byId: string; byName: string } // a player chose to pass this round
  // ---- Maç içi Özel Güçler ----
  // Maç başında + reconnect'te gönderilir: SENİN kuşanılmış gücün ve kullanım
  // durumu. Rakibin SEÇTİĞİ güç asla sızmaz (stratejik gizlilik) — yalnız
  // KULLANDIĞI güç, kullanım ANINDA activated ile açıklanır.
  | { type: 'special_power_state'; enabled: boolean; you: { powerId: string | null; qty: number; used: boolean; usedPowerId: string | null }; opponentUsedPowerId: string | null; config: { freezeMs: number; extraTimeMs: number }; activeFreezeUntil?: number; yourDeadline?: number; slots?: { powerId: string; qty: number; used: boolean }[]; usedTotal?: number; maxPerMatch?: number }
  // İKİ istemciye de aynı olay: kim, hangi güç, hangi tur. effect alanı güce özgü
  // sunucu-zamanı verir (freezeUntil / newDeadline) — istemci saatine güvenilmez.
  | { type: 'special_power_activated'; byId: string; byName: string; powerId: string; roundNumber: number; serverNow: number; effect?: { targetId?: string; freezeUntil?: number; newDeadline?: number } }
  // YALNIZ kullanan oyuncuya: Answer Reveal'ın sunucu-verisinden gelen cevabı.
  | { type: 'special_power_reveal'; playerName: string; imageUrl: string | null }
  // Güce özgü SONUÇ olayı (ör. İkinci Şans tetiklendi) — iki taraf da anlar.
  | { type: 'special_power_effect'; kind: 'second_chance_triggered'; byId: string; byName: string }
  // Reddedilen etkinleştirme — envanter TÜKETİLMEMİŞTİR.
  | { type: 'special_power_denied'; reason: 'already_used' | 'no_inventory' | 'round_not_active' | 'match_over' | 'too_late' | 'unavailable' | 'invalid'; requestId?: string }
  | { type: 'special_power_equipped'; powerId: string | null; profile: ProfileView }
  | { type: 'special_power_purchased'; powerId: string; profile: ProfileView }
  // Galibiyet serisi kilometre taşı ödülü (maç sonu, trophy_update'ten sonra).
  | { type: 'streak_reward'; streak: number; diamonds: number; powerId: string | null; profile: ProfileView }
  // ---- Futbol XOX (Tiki-Taka-Toe) — sunucu-otoriter 3×3 durum ----
  // Her hamle/zaman aşımı sonrası TAM durum yayınlanır: iki istemci aynı
  // kaynaktan çizer (desync imkânsız). lastAction sunum katmanı içindir.
  | { type: 'xox_state'; rows: ClubRef[]; cols: ClubRef[]; cells: { owner: string | null; playerName: string | null; playerImageUrl: string | null }[]; turnId: string | null; turnEndsAt: number; turnNumber: number; turnCap: number; suddenDeath: boolean; suddenCell: number | null; lastAction?: { kind: 'claim' | 'wrong' | 'timeout'; byId: string; byName: string; cell?: number; guess?: string; playerName?: string } }
  // Maç bitti: line = kazanan 3'lü (hücre indeksleri) ya da null (çoğunluk/tie-break).
  | { type: 'xox_over'; winnerId: string | null; winnerName: string | null; line: number[] | null; reason: 'line' | 'majority' | 'sudden_death' | 'tiebreak' | 'draw'; emptyReveal?: { cell: number; playerName: string; playerImageUrl: string | null }[] }
  // ---- Çöz Kazan — sunucu-otoriter yarış durumu (her olayda TAM durum) ----
  // scrambled: karışık harfli kelimeler (ayrı gruplar). reveal!=null → tur açıldı
  // (çözüldü ya da süre bitti), cevap + oyuncu gösterilir. locks: oyuncu bazlı
  // 5sn yanlış-kilidi (until = ms epoch; client kendi id'sine bakar).
  | { type: 'cozkazan_state'; round: number; totalRounds: number; scrambled: string[]; roundEndsAt: number; scores: { id: string; name: string; score: number }[]; locks: { id: string; until: number }[]; reveal: { answer: string; playerName: string; playerImageUrl: string | null; solvedById: string | null; solvedByName: string | null } | null }
  | { type: 'cozkazan_over'; winnerId: string | null; winnerName: string | null; reason: 'points' | 'sudden_death' | 'draw'; scores: { id: string; name: string; score: number }[] }
  | { type: 'cozkazan_hint_result'; round: number; position: number; letter: string; diamonds: number } // özel: sadece isteyene
  | { type: 'cozkazan_hint_error'; reason: 'insufficient' | 'unavailable' }
  // ── "Ben Kimim?" ──
  // Havuz listesi (otomatik-tamamlama için) — maç başında bir kez yollanır.
  | { type: 'guesswho_pool'; players: { id: number; name: string }[] }
  // Tam durum: bulanık hedef foto + blur seviyesi + ortak kalan hak + sıra + tahmin
  // satırları (iki taraf da görür). Bittiğinde reveal ile hedef açığa çıkar.
  // ÇOK TURLU Ben Kimim (2026-09-06, yalnız tüm insan istemciler 'gwrounds' bildirirse):
  // round/target/scores her durumda; roundOver=true → tur kapandı, reveal dolu, turnId null,
  // nextRoundAt'te yeni tur (over hâlâ false). over=true MAÇ bitti (eski anlam, değişmedi).
  | { type: 'guesswho_state'; targetImageUrl: string | null; blurLevel: number; guessesLeft: number; turnId: string | null; turnEndsAt: number; guesses: GwRow[]; over: boolean; winnerId: string | null; winnerName: string | null; reveal: GwReveal | null; lastGuessById?: string; round?: number; target?: number; scores?: { id: string; name: string; score: number }[]; roundOver?: boolean; roundWinnerId?: string | null; nextRoundAt?: number | null }
  | { type: 'guesswho_denied'; reason: 'not_turn' | 'not_pool' | 'already' | 'over' } // özel: sadece gönderene
  // matchOver: a player reached `target` wins → the match is over (offer rematch).
  | {
      type: 'result';
      result: RoundResult;
      players: PlayerView[];
      matchOver: boolean;
      winnerId: string | null;
      winnerName: string | null;
      target: number;
    }
  | { type: 'waiting_ready' } // waiting for players to press ready
  | { type: 'ready_countdown'; endsAt: number } // forced countdown started
  | { type: 'player_ready'; playerId: string } // a player pressed ready
  | { type: 'rematch_requested'; byId: string; byName: string } // opponent wants to play again
  | { type: 'rematch_waiting' } // your rematch request was sent, waiting for opponent
  | { type: 'rematch_declined' } // opponent declined your rematch request
  | { type: 'trophy_update'; matchId?: string; trophies: number; delta: number; arena: ArenaView; diamonds?: number; arenaReward?: number; highestArenaRewarded?: number; shielded?: boolean; winStreak?: number; bestStreak?: number; lostStreak?: number } // shielded: Kupa Kalkanı bu mağlubiyetin kupa kaybını emdi; lostStreak: geri yüklenebilir kırık seri (maç sonrası 0'a döner)
  | { type: 'xp_update'; xp: number; level: number; xpForNext: number; gained: number; leveledUp: { level: number; diamonds: number; emoteId?: string; powerId?: string }[]; diamonds?: number; boosted?: boolean }
  | { type: 'level_reward_claimed'; level: number; diamonds: number; emoteId: string | null; frameTier: string | null; powerId?: string | null; track?: 'free' | 'premium'; profile: ProfileView } // yol kartından ödül toplandı // maç sonu seviye ilerlemesi
  | { type: 'premium_road_purchased'; profile: ProfileView } // Premium Yol açıldı
  // BAKIM MODU (2026-09-01): açılış/kapanışta TÜM bağlı istemcilere yayınlanır;
  // ayrıca register yanıtında da gider (uygulamayı yeni açan da anında görür).
  | { type: 'maintenance_state'; active: boolean; message: string; startedAt: string | null }
  | { type: 'season_reward_pending'; seasonId: string; peakTrophies: number; peakArenaName: string; diamonds: number; specialPower: string | null; frameTier: string | null; cosmeticId: string | null; avatarId: string }
  | { type: 'season_reward_claimed'; seasonId: string; profile: ProfileView }
  | { type: 'power_purchased'; powerId: string; profile: ProfileView } // mağazadan güç alındı
  | { type: 'power_used'; powerId: string; profile: ProfileView } // güç etkinleştirildi (jeton düştü / kalkan kuşanıldı)
  | { type: 'outage_gift_claimed'; profile: ProfileView; granted: boolean } // granted=false → zaten alınmıştı
  | { type: 'referral_redeemed'; profile: ProfileView; referrerName: string; reward: number }
  // Günün Crossover'ı — state hem ilk açılışta hem bitişte aynı şekilde gider.
  | { type: 'daily_crossover'; state: DailyCrossoverStateView }
  | { type: 'daily_career'; state: DailyCareerStateView }
  | { type: 'daily_quests'; quests: DailyQuestsView }
  | { type: 'season_state'; season: SeasonStateView }
  | { type: 'heartbeat' } // soketi taze tutar; istemci içerik olarak yok sayar
  | { type: 'quest_claimed'; questId: string; xp: number; quests: DailyQuestsView; profile?: ProfileView }
  | { type: 'daily_career_result'; state: DailyCareerStateView; correct: boolean; rewardGranted: number; profile?: ProfileView }
  | { type: 'daily_crossover_wrong'; guess: string; suggestion: string | null; attemptsLeft: number }
  | { type: 'daily_crossover_done'; state: DailyCrossoverStateView; rewardGranted: number; profile?: ProfileView }
  | { type: 'daily_offer'; offer: { key: string; kind: 'cosmetic' | 'power_bundle' | 'socialtoken'; itemId: string; qty: number; originalPrice: number; price: number; expiresAt: string } | null } // null → bu pencerede alınmış
  | { type: 'daily_offer_purchased'; profile: ProfileView; offer: { key: string; kind: 'cosmetic' | 'power_bundle' | 'socialtoken'; itemId: string; qty: number; originalPrice: number; price: number; expiresAt: string } }
  | { type: 'my_stats'; winStreak: number; bestStreak: number; wins: number; losses: number; modes: { mode: string; wins: number; losses: number }[] } // profil istatistikleri
  | { type: 'emote'; fromId: string; emoteId: string } // a player in the room sent an emote
  | { type: 'emote_purchased'; profile: ProfileView; emoteId: string } // store purchase succeeded
  | { type: 'avatar_purchased'; profile: ProfileView; avatarId: string }
  | { type: 'store_catalog'; catalog: { version: number; serverTime: string; dailyResetAt: string; weeklyResetAt: string; items: { id: string; type: string; name: string; description: string; rarity: string; diamondPrice: number; isLimited?: boolean; availableFrom?: string; availableUntil?: string }[]; featured: string[]; specialPowers?: { id: string; rarity: string; price: number }[]; vaultItemId?: string; vaultUntil?: string; firstDiamondDoubleAvailable?: boolean } }
  | { type: 'cosmetic_purchased'; profile: ProfileView; itemId: string; alreadyOwned?: boolean }
  | { type: 'cosmetic_equipped'; profile: ProfileView; itemId: string | null; cosmeticType: string }
  | { type: 'diamonds_granted'; profile: ProfileView; granted: number } // IAP validated → diamonds added
  | { type: 'ad_reward_result'; ok: boolean; granted?: number; profile?: ProfileView; error?: string } // rewarded-ad grant (separate from IAP)
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
  // ---- Friends ----
  | { type: 'friend_request_received'; requestId: string; fromId: string; fromName: string }
  | { type: 'friend_request_sent' }
  | { type: 'friend_request_responded'; requestId: string; accepted: boolean }
  | { type: 'friends_list'; friends: FriendView[]; requests: FriendRequestView[] }
  | { type: 'user_search_results'; users: { userId: string; displayName: string }[] }
  | { type: 'friend_removed'; friendId: string }
  | { type: 'match_invite_received'; fromId: string; fromName: string; options?: GameOptions }
  | { type: 'match_invite_declined'; byId: string; reason?: 'social_pack_required' } // your invite was declined (sent to inviter)
  | { type: 'match_invite_cancelled' } // the invite was cancelled/expired (sent to invitee)
  | { type: 'user_profile'; profile: PublicProfile }
  | { type: 'match_history_list'; matches: MatchHistoryView[] }
  // ---- Direct Messages ----
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
  bestStreak?: number;    // tüm zamanların en yüksek galibiyet serisi (herkese açık)
  // Mod bazında dereceli maç kırılımı. Solo zorluk botu ve dostluk/oda maçları hariç.
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
  }[];
  playedAt: string;
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
  lastSeen?: string | null; // ISO; when they were last online (for offline friends)
}

export interface FriendRequestView {
  requestId: string;
  fromId: string;
  fromName: string;
  createdAt: string;
}
