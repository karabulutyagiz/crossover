import crypto from 'node:crypto';
import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import type { Role } from '../core/types.ts';

// Growth paneli kimlik doğrulama — oyun admin panelindeki desenin aynısı
// (scrypt hash + HMAC imzalı stateless jeton) + RBAC (bölüm 30).
// GROWTH_ADMIN_TOKEN boşsa API tamamen kapalıdır.

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 gün

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function upsertUser(email: string, pw: string, role: Role): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e || !pw) throw new Error('email ve şifre gerekli');
  await pool.query(
    `INSERT INTO growth_users (email, password_hash, role) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    [e, hashPassword(pw), role],
  );
}

export async function checkLogin(email: string, pw: string): Promise<Role | null> {
  if (!config.adminToken) return null; // anahtarsız imza = sahtelenebilir jeton; API kapalı
  const e = (email ?? '').trim().toLowerCase();
  if (!e || !pw) return null;
  const { rows } = await pool.query<{ password_hash: string; role: Role }>(
    `SELECT password_hash, role FROM growth_users WHERE email = $1`,
    [e],
  );
  const row = rows[0];
  if (!row) return null;
  return verifyPassword(pw, row.password_hash) ? row.role : null;
}

function sign(data: string): string {
  if (!config.adminToken) throw new Error('GROWTH_ADMIN_TOKEN unset — growth API disabled');
  return crypto.createHmac('sha256', config.adminToken).update(data).digest('hex');
}

export function issueToken(email: string, role: Role): string {
  const payload = `${Buffer.from(`${email.trim().toLowerCase()}|${role}`).toString('base64url')}.${Date.now() + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export interface Session {
  email: string;
  role: Role;
}

export function verifyToken(token: string): Session | null {
  if (!config.adminToken || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [b64, expStr, mac] = parts as [string, string, string];
  const payload = `${b64}.${expStr}`;
  const expected = sign(payload);
  const macBuf = Buffer.from(mac, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) return null;
  if (!Number.isFinite(Number(expStr)) || Number(expStr) < Date.now()) return null;
  try {
    const decoded = Buffer.from(b64, 'base64url').toString('utf8');
    const [email, role] = decoded.split('|');
    if (!email || (role !== 'ADMIN' && role !== 'MARKETING' && role !== 'VIEWER')) return null;
    return { email, role };
  } catch {
    return null;
  }
}

// Rol hiyerarşisi: ADMIN > MARKETING > VIEWER.
const ROLE_LEVEL: Record<Role, number> = { ADMIN: 3, MARKETING: 2, VIEWER: 1 };

export function hasRole(session: Session, min: Role): boolean {
  return ROLE_LEVEL[session.role] >= ROLE_LEVEL[min];
}
