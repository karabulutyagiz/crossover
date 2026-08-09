// WebSocket message protocol shared between the game server and clients.
// JSON messages discriminated by `type`. (The RN app mirrors these types.)

import type { SpellInfo, VerifyReason } from './game/verify.ts';

export interface ClubRef {
  id: number;
  name: string;
  logoUrl: string | null;
}

export type RoomStatus = 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Game mode: determines what each player picks and how the guess is verified.
export type GameMode = 'team-team' | 'country-team' | 'letter-team' | 'player-player';

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
  arena: ArenaView;
  avatar: string | null; // chosen profile-picture id (e.g. 'pp7') or null
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
}

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  wrongCount: number;
  isHost: boolean;
  connected: boolean;
  trophies?: number;
  arena?: ArenaView;
  avatar?: string | null;
  level?: number; // eşleşme kartındaki seviye rozeti için
  frame?: string | null; // takılı profil çerçevesi — rakip de görür
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  players: PlayerView[];
  youId: string;
}

// ---- Client -> Server ----
export type ClientMsg =
  | { type: 'create_room'; name: string; userId?: string; options?: GameOptions }
  | { type: 'create_solo'; name: string; userId?: string; options?: GameOptions }
  | { type: 'join_room'; code: string; name: string; userId?: string }
  // caps: istemci yetenek bayrakları ('wrongopen' = yanlış cevapta turun rakibe
  // açılmasını ve wrong_guess/guess_denied mesajlarını anlar). Eski istemciler
  // göndermez → sunucu o odalarda eski (kilitli) kuralı uygular.
  | { type: 'resume_room'; code: string; userId: string; caps?: string[] } // reconnect a dropped player during grace period
  | { type: 'register'; name: string; gameCenterId?: string; userId?: string; caps?: string[] }
  | { type: 'guest'; caps?: string[] } // guest login → server creates an account with an auto "M"+9-digit username
  | { type: 'auth'; provider: 'apple' | 'google' | 'facebook'; token: string; name?: string; userId?: string; caps?: string[] }
  | { type: 'change_name'; newName: string }
  | { type: 'set_username'; username: string; userId?: string } // one-time unique username after sign-in
  | { type: 'find_match'; name?: string; userId?: string; options?: GameOptions } // ranked matchmaking
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
  | { type: 'set_avatar'; avatar: string | null } // choose/select profile picture ('pp7' or null)
  | { type: 'set_frame'; frameId: string | null }
  | { type: 'claim_level_reward'; level: number; track?: 'free' | 'premium' } // Seviye Yolu kartına dokunarak ödül topla (şerit seçimiyle)
  | { type: 'buy_premium_road' } // Premium Seviye Yolu'nu 1000 elmasla aç
  | { type: 'buy_power'; powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken' } // mağazadan güç satın al
  | { type: 'use_power'; powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken' } // envanterdeki tek kullanımlık gücü etkinleştir
  | { type: 'get_my_stats' } // profil istatistikleri: seri rekoru + mod bazlı K/M
  | { type: 'verify_purchase'; receipt: string } // validate an Apple IAP receipt → grant diamonds
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
  | { type: 'leave_match' };

// ---- Server -> Client ----
export interface RoundResult {
  correct: boolean;
  reason: VerifyReason | 'timeout' | 'no_common' | 'same_team' | 'passed' | 'all_wrong';
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
  | { type: 'countdown'; n: number }
  | { type: 'pick_phase'; endsAt: number; pickRole?: PickRole; usedClubIds?: number[]; usedCountries?: string[] } // maç boyu seçilmiş takım/ülkeler (karart+kilitle)
  | { type: 'team_picked'; playerId: string }
  | { type: 'reveal_teams'; teamA: ClubRef; teamB: ClubRef; mode?: GameMode; country?: string; letter?: string }
  | { type: 'guess_phase'; endsAt: number }
  | { type: 'guess_locked'; byId: string; byName: string }
  // Yeni kural (wrongopen odaları): yanlış cevap turu YAKMAZ — yazan susturulur,
  // rakibin kilidi açılır. wrongCount o oyuncunun toplam çarpısıdır (3 = hükmen).
  | { type: 'wrong_guess'; byId: string; byName: string; guess: string; wrongCount: number }
  // Kişiye özel ret: 'too_late' = rakip senden önce gönderdi; 'burned' = bu turda hakkın bitti.
  | { type: 'guess_denied'; reason: 'too_late' | 'burned' }
  | { type: 'pass_locked'; byId: string; byName: string } // a player chose to pass this round
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
  | { type: 'trophy_update'; trophies: number; delta: number; arena: ArenaView; diamonds?: number; arenaReward?: number; shielded?: boolean; winStreak?: number; bestStreak?: number } // shielded: Kupa Kalkanı bu mağlubiyetin kupa kaybını emdi
  | { type: 'xp_update'; xp: number; level: number; xpForNext: number; gained: number; leveledUp: { level: number; diamonds: number; emoteId?: string; powerId?: string }[]; diamonds?: number; boosted?: boolean }
  | { type: 'level_reward_claimed'; level: number; diamonds: number; emoteId: string | null; frameTier: string | null; powerId?: string | null; track?: 'free' | 'premium'; profile: ProfileView } // yol kartından ödül toplandı // maç sonu seviye ilerlemesi
  | { type: 'premium_road_purchased'; profile: ProfileView } // Premium Yol açıldı
  | { type: 'power_purchased'; powerId: string; profile: ProfileView } // mağazadan güç alındı
  | { type: 'power_used'; powerId: string; profile: ProfileView } // güç etkinleştirildi (jeton düştü / kalkan kuşanıldı)
  | { type: 'my_stats'; winStreak: number; bestStreak: number; modes: { mode: string; wins: number; losses: number }[] } // profil istatistikleri
  | { type: 'emote'; fromId: string; emoteId: string } // a player in the room sent an emote
  | { type: 'emote_purchased'; profile: ProfileView; emoteId: string } // store purchase succeeded
  | { type: 'avatar_purchased'; profile: ProfileView; avatarId: string }
  | { type: 'diamonds_granted'; profile: ProfileView; granted: number } // IAP validated → diamonds added
  | { type: 'ad_reward_result'; ok: boolean; granted?: number; profile?: ProfileView; error?: string } // rewarded-ad grant (separate from IAP)
  | { type: 'club_results'; reqId: string; clubs: ClubRef[] }
  | { type: 'player_results'; players: PlayerRef[] }
  | { type: 'searching' }
  | { type: 'opponent_left'; forfeit?: boolean }
  // ---- Friends ----
  | { type: 'friend_request_received'; requestId: string; fromId: string; fromName: string }
  | { type: 'friend_request_sent' }
  | { type: 'friend_request_responded'; requestId: string; accepted: boolean }
  | { type: 'friends_list'; friends: FriendView[]; requests: FriendRequestView[] }
  | { type: 'user_search_results'; users: { userId: string; displayName: string }[] }
  | { type: 'friend_removed'; friendId: string }
  | { type: 'match_invite_received'; fromId: string; fromName: string; options?: GameOptions }
  | { type: 'match_invite_declined'; byId: string } // your invite was declined (sent to inviter)
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
  | { type: 'error'; message: string };

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
