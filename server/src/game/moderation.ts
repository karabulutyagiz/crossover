// User-generated-content safety: blocking, reporting, self-deletion, bans.
//
// App Store guideline 1.2 requires ALL of these for an app where users can post
// content that others see (here: direct messages and usernames). Missing them is
// what got v1.0 build 121 rejected. The content FILTER lives in username.ts
// (`censorMessage`); everything else is here.
import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';

export interface BlockedUserView {
  userId: string;
  displayName: string;
  avatar: string | null;
}

/**
 * Block a user. One-way in intent, two-way in effect — see `isBlockedBetween`.
 * Blocking also drops any existing friendship: staying "friends" with someone you
 * blocked leaves them on your list and in your invite flows, which is exactly the
 * contact the block is meant to end.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new Error('cannot block yourself');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO blocked_users (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [blockerId, blockedId],
    );
    await client.query(
      `DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [blockerId, blockedId],
    );
    await client.query(
      `DELETE FROM friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)`,
      [blockerId, blockedId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  log.info('user_blocked', { blockerId, blockedId });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await pool.query(
    `DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId],
  );
  log.info('user_unblocked', { blockerId, blockedId });
}

/**
 * True if EITHER user has blocked the other. Every contact path (DM, friend
 * request, match invite) must consult this, not just the blocker's direction:
 * otherwise the person you blocked can still open a channel to you.
 */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT 1 AS n FROM blocked_users
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [a, b],
  );
  return rows.length > 0;
}

/** Every user this person has blocked — for the "Blocked users" settings list. */
export async function listBlocked(userId: string): Promise<BlockedUserView[]> {
  const { rows } = await pool.query<{ id: string; display_name: string; avatar: string | null }>(
    `SELECT u.id, u.display_name, u.avatar
       FROM blocked_users b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ userId: r.id, displayName: r.display_name, avatar: r.avatar }));
}

/**
 * File a report. `messageId` null = reporting the user rather than one message.
 * The message body is snapshotted so the report survives the sender deleting it.
 */
export async function reportContent(
  reporterId: string,
  reportedId: string,
  reason: string,
  messageId?: string | null,
): Promise<void> {
  let snapshot: string | null = null;
  if (messageId) {
    const { rows } = await pool.query<{ body: string }>(
      `SELECT body FROM messages WHERE id = $1 AND from_user = $2`,
      [messageId, reportedId],
    );
    snapshot = rows[0]?.body ?? null;
  }
  await pool.query(
    `INSERT INTO content_reports (reporter_id, reported_id, message_id, body_snapshot, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [reporterId, reportedId, messageId ?? null, snapshot, reason.slice(0, 200)],
  );
  // Logged at warn so open reports surface in the ops log — this is the trigger
  // for the 24-hour review commitment in the EULA.
  log.warn('content_reported', { reporterId, reportedId, messageId: messageId ?? null, reason: reason.slice(0, 80) });
}

/**
 * Soft-delete one's OWN message ("a mechanism for users to immediately remove
 * posts"). Soft, not hard: an already-filed report must keep its evidence.
 * Returns false when the message isn't the caller's (or doesn't exist).
 */
export async function deleteOwnMessage(userId: string, messageId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE messages SET deleted_at = now()
      WHERE id = $1 AND from_user = $2 AND deleted_at IS NULL`,
    [messageId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** True if the account has been ejected for violating the content rules. */
export async function isBanned(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ banned_at: string | null }>(
    `SELECT banned_at FROM users WHERE id = $1`,
    [userId],
  );
  return Boolean(rows[0]?.banned_at);
}

/** Record that the user accepted the EULA (guideline 1.2 requires agreement). */
export async function acceptTerms(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET terms_accepted_at = now() WHERE id = $1 AND terms_accepted_at IS NULL`,
    [userId],
  );
}
