import type { ClientMsg } from '../protocol.ts';

type ValidationResult = { ok: true; msg: ClientMsg } | { ok: false; error: string };

const MODES = new Set(['team-team', 'country-team', 'letter-team', 'player-player']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const PROVIDERS = new Set(['apple', 'google', 'facebook']);
const POWER_IDS = new Set(['xp2x', 'shield', 'streak', 'training', 'socialtoken']);
const REWARD_TRACKS = new Set(['free', 'premium']);
const PLATFORMS = new Set(['ios', 'android']);
const COSMETIC_TYPES = new Set(['frame', 'name_effect', 'match_background', 'ball', 'intro', 'victory_effect', 'answer_effect']);

function invalid(error: string): ValidationResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown, max = 1000): value is string {
  return typeof value === 'string' && value.length <= max;
}

function hasString(obj: Record<string, unknown>, key: string, max = 1000): boolean {
  return isString(obj[key], max);
}

function hasOptionalString(obj: Record<string, unknown>, key: string, max = 1000): boolean {
  return obj[key] === undefined || isString(obj[key], max);
}

function hasOptionalNullableString(obj: Record<string, unknown>, key: string, max = 1000): boolean {
  return obj[key] === undefined || obj[key] === null || isString(obj[key], max);
}

function hasBoolean(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'boolean';
}

function hasInteger(obj: Record<string, unknown>, key: string, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): boolean {
  const value = obj[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function hasOptionalStringArray(obj: Record<string, unknown>, key: string, maxItems = 16, maxLen = 64): boolean {
  const value = obj[key];
  return value === undefined || (Array.isArray(value) && value.length <= maxItems && value.every((item) => isString(item, maxLen)));
}

function validStringArray(value: unknown, maxItems = 16, maxLen = 64): boolean {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => isString(item, maxLen));
}

function validScope(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (value.type === 'all') return true;
  if (value.type === 'league' || value.type === 'country') return isString(value.value, 120);
  return false;
}

function validOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  if (!validScope(value.scope)) return false;
  if (value.difficulty !== undefined && (typeof value.difficulty !== 'string' || !DIFFICULTIES.has(value.difficulty))) return false;
  if (value.mode !== undefined && (typeof value.mode !== 'string' || !MODES.has(value.mode))) return false;
  return true;
}

function validCaps(obj: Record<string, unknown>): boolean {
  return hasOptionalStringArray(obj, 'caps', 16, 64);
}

export function validateClientMsg(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid('message must be an object');
  if (!isString(value.type, 64)) return invalid('message type is missing');

  switch (value.type) {
    case 'create_room':
    case 'create_solo':
      if (!hasString(value, 'name', 80)) return invalid(`${value.type}.name must be a string`);
      if (!hasOptionalString(value, 'userId', 128)) return invalid(`${value.type}.userId must be a string`);
      if (!validOptions(value.options)) return invalid(`${value.type}.options is invalid`);
      if (!validCaps(value)) return invalid(`${value.type}.caps is invalid`);
      break;
    case 'join_room':
      if (!hasString(value, 'code', 24)) return invalid('join_room.code must be a string');
      if (!hasString(value, 'name', 80)) return invalid('join_room.name must be a string');
      if (!hasOptionalString(value, 'userId', 128)) return invalid('join_room.userId must be a string');
      if (!validCaps(value)) return invalid('join_room.caps is invalid');
      break;
    case 'resume_room':
      if (!hasString(value, 'code', 24)) return invalid('resume_room.code must be a string');
      if (!hasString(value, 'userId', 128)) return invalid('resume_room.userId must be a string');
      if (!validCaps(value)) return invalid('resume_room.caps is invalid');
      break;
    case 'register':
      if (!hasString(value, 'name', 80)) return invalid('register.name must be a string');
      if (!hasOptionalString(value, 'gameCenterId', 256)) return invalid('register.gameCenterId must be a string');
      if (!hasOptionalString(value, 'userId', 128)) return invalid('register.userId must be a string');
      if (!validCaps(value)) return invalid('register.caps is invalid');
      break;
    case 'guest':
      if (!validCaps(value)) return invalid('guest.caps is invalid');
      break;
    case 'auth':
      if (typeof value.provider !== 'string' || !PROVIDERS.has(value.provider)) return invalid('auth.provider is invalid');
      if (!hasString(value, 'token', 256_000)) return invalid('auth.token must be a string');
      if (!hasOptionalString(value, 'name', 80)) return invalid('auth.name must be a string');
      if (!hasOptionalString(value, 'userId', 128)) return invalid('auth.userId must be a string');
      if (!validCaps(value)) return invalid('auth.caps is invalid');
      break;
    case 'change_name':
      if (!hasString(value, 'newName', 80)) return invalid('change_name.newName must be a string');
      break;
    case 'set_username':
      if (!hasString(value, 'username', 80)) return invalid('set_username.username must be a string');
      if (!hasOptionalString(value, 'userId', 128)) return invalid('set_username.userId must be a string');
      break;
    case 'find_match':
      if (!hasOptionalString(value, 'name', 80)) return invalid('find_match.name must be a string');
      if (!hasOptionalString(value, 'userId', 128)) return invalid('find_match.userId must be a string');
      if (!validOptions(value.options)) return invalid('find_match.options is invalid');
      if (!validCaps(value)) return invalid('find_match.caps is invalid');
      break;
    case 'start':
    case 'pass':
    case 'ready':
    case 'play_again':
    case 'get_my_stats':
    case 'grant_ad_reward':
    case 'list_friends':
    case 'list_conversations':
    case 'list_match_history':
    case 'list_blocked':
    case 'accept_terms':
    case 'delete_account':
    case 'buy_premium_road':
    case 'get_store_catalog':
    case 'claim_outage_gift':
    case 'get_daily_offer':
      break;
    case 'buy_daily_offer':
      if (!hasString(value, 'key', 80)) return invalid('buy_daily_offer.key must be a string');
      break;
    case 'leave_match':
      if (value.reason !== undefined && value.reason !== 'leave' && value.reason !== 'cheat') return invalid('leave_match.reason is invalid');
      break;
    case 'pick_team':
      if (!hasInteger(value, 'clubId', 1)) return invalid('pick_team.clubId must be a positive integer');
      break;
    case 'pick_country':
      if (!hasString(value, 'country', 120)) return invalid('pick_country.country must be a string');
      break;
    case 'pick_letter':
      if (!hasString(value, 'letter', 8)) return invalid('pick_letter.letter must be a string');
      break;
    case 'submit_guess':
      if (!hasString(value, 'text', 200)) return invalid('submit_guess.text must be a string');
      break;
    case 'rematch_response':
      if (!hasBoolean(value, 'accept')) return invalid('rematch_response.accept must be a boolean');
      break;
    case 'send_emote':
    case 'buy_emote':
      if (!hasString(value, 'emoteId', 80)) return invalid(`${value.type}.emoteId must be a string`);
      break;
    case 'equip_emotes':
      if (!validStringArray(value.emoteIds, 16, 80)) return invalid('equip_emotes.emoteIds is invalid');
      break;
    case 'buy_avatar':
      if (!hasString(value, 'avatarId', 80)) return invalid('buy_avatar.avatarId must be a string');
      break;
    case 'buy_cosmetic':
      if (!hasString(value, 'itemId', 120)) return invalid('buy_cosmetic.itemId must be a string');
      if (!hasOptionalString(value, 'idempotencyKey', 160)) return invalid('buy_cosmetic.idempotencyKey must be a string');
      break;
    case 'equip_cosmetic':
      if (!hasOptionalNullableString(value, 'itemId', 120) || value.itemId === undefined) return invalid('equip_cosmetic.itemId must be a string or null');
      if (typeof value.cosmeticType !== 'string' || !COSMETIC_TYPES.has(value.cosmeticType)) return invalid('equip_cosmetic.cosmeticType is invalid');
      break;
    case 'set_avatar':
      if (!hasOptionalNullableString(value, 'avatar', 80) || value.avatar === undefined) return invalid('set_avatar.avatar must be a string or null');
      break;
    case 'set_frame':
      if (!hasOptionalNullableString(value, 'frameId', 80) || value.frameId === undefined) return invalid('set_frame.frameId must be a string or null');
      break;
    case 'claim_level_reward':
      if (!hasInteger(value, 'level', 1, 1000)) return invalid('claim_level_reward.level must be a positive integer');
      if (value.track !== undefined && (typeof value.track !== 'string' || !REWARD_TRACKS.has(value.track))) return invalid('claim_level_reward.track is invalid');
      break;
    case 'buy_power':
    case 'use_power':
      if (typeof value.powerId !== 'string' || !POWER_IDS.has(value.powerId)) return invalid(`${value.type}.powerId is invalid`);
      break;
    case 'verify_purchase':
      if (!hasString(value, 'receipt', 256_000)) return invalid('verify_purchase.receipt must be a string');
      break;
    case 'search_clubs':
      if (!hasString(value, 'reqId', 80)) return invalid('search_clubs.reqId must be a string');
      if (!hasString(value, 'q', 120)) return invalid('search_clubs.q must be a string');
      break;
    case 'pick_player':
      if (!hasInteger(value, 'playerId', 1)) return invalid('pick_player.playerId must be a positive integer');
      break;
    case 'search_players':
      if (!hasString(value, 'q', 120)) return invalid('search_players.q must be a string');
      break;
    case 'send_friend_request':
      if (!hasOptionalString(value, 'targetCode', 64)) return invalid('send_friend_request.targetCode must be a string');
      if (!hasOptionalString(value, 'targetUsername', 80)) return invalid('send_friend_request.targetUsername must be a string');
      break;
    case 'respond_friend_request':
      if (!hasString(value, 'requestId', 128)) return invalid('respond_friend_request.requestId must be a string');
      if (!hasBoolean(value, 'accept')) return invalid('respond_friend_request.accept must be a boolean');
      break;
    case 'search_users':
      if (!hasString(value, 'query', 80)) return invalid('search_users.query must be a string');
      break;
    case 'remove_friend':
    case 'invite_friend_match':
      if (!hasString(value, 'friendId', 128)) return invalid(`${value.type}.friendId must be a string`);
      if (value.type === 'invite_friend_match' && !validOptions(value.options)) return invalid('invite_friend_match.options is invalid');
      break;
    case 'respond_match_invite':
      if (!hasString(value, 'fromId', 128)) return invalid('respond_match_invite.fromId must be a string');
      if (!hasBoolean(value, 'accept')) return invalid('respond_match_invite.accept must be a boolean');
      break;
    case 'cancel_match_invite':
      if (!hasString(value, 'toId', 128)) return invalid('cancel_match_invite.toId must be a string');
      break;
    case 'get_user_profile':
    case 'block_user':
    case 'unblock_user':
      if (!hasString(value, 'userId', 128)) return invalid(`${value.type}.userId must be a string`);
      break;
    case 'send_message':
      if (!hasString(value, 'toUserId', 128)) return invalid('send_message.toUserId must be a string');
      if (!hasString(value, 'body', 5000)) return invalid('send_message.body must be a string');
      break;
    case 'list_messages':
      if (!hasString(value, 'withUserId', 128)) return invalid('list_messages.withUserId must be a string');
      if (!hasOptionalString(value, 'before', 80)) return invalid('list_messages.before must be a string');
      break;
    case 'mark_read':
      if (!hasString(value, 'fromUserId', 128)) return invalid('mark_read.fromUserId must be a string');
      break;
    case 'typing_start':
    case 'typing_stop':
      if (!hasString(value, 'toUserId', 128)) return invalid(`${value.type}.toUserId must be a string`);
      break;
    case 'report_content':
      if (!hasString(value, 'userId', 128)) return invalid('report_content.userId must be a string');
      if (!hasString(value, 'reason', 300)) return invalid('report_content.reason must be a string');
      if (!hasOptionalString(value, 'messageId', 128)) return invalid('report_content.messageId must be a string');
      break;
    case 'delete_message':
      if (!hasString(value, 'messageId', 128)) return invalid('delete_message.messageId must be a string');
      break;
    case 'register_push':
      if (!hasString(value, 'token', 4096)) return invalid('register_push.token must be a string');
      if (typeof value.platform !== 'string' || !PLATFORMS.has(value.platform)) return invalid('register_push.platform is invalid');
      if (!hasOptionalString(value, 'lang', 32)) return invalid('register_push.lang must be a string');
      break;
    default:
      return invalid(`unknown message type: ${value.type}`);
  }

  return { ok: true, msg: value as ClientMsg };
}
