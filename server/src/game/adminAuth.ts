// Admin paneli kimlik doğrulama: e-posta + şifre girişi, imzalı oturum jetonu.
//
// Şifreler scrypt ile hash'lenir (düz metin ASLA saklanmaz). Giriş başarılıysa
// süreli, HMAC ile imzalı bir jeton verilir; /admin/api/stats bu jetonu STATELESS
// doğrular (oturum tablosu yok). İmza anahtarı = ADMIN_TOKEN (env'de sunucu sırrı).
import crypto from 'node:crypto';
import { pool } from '../db/pool.ts';
import { config } from '../config.ts';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // oturum ömrü: 30 gün

// ── Şifre hash'leme (scrypt) ──
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

// ── Kullanıcı CRUD ──
export async function upsertAdminUser(email: string, pw: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e || !pw) throw new Error('email ve şifre gerekli');
  await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [e, hashPassword(pw)],
  );
}

export async function checkLogin(email: string, pw: string): Promise<boolean> {
  // ADMIN_TOKEN yoksa admin API tamamen KAPALIDIR (docker-compose sözleşmesi:
  // "Empty = admin API off"). Anahtarsız girişe izin vermek, jetonların sabit
  // 'unset-secret' ile imzalanması — yani sahtelenebilir olması — demekti.
  if (!config.adminToken) return false;
  const e = (email ?? '').trim().toLowerCase();
  if (!e || !pw) return false;
  const { rows } = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM admin_users WHERE email = $1`,
    [e],
  );
  if (!rows[0]) return false;
  return verifyPassword(pw, rows[0].password_hash);
}

// ── İmzalı oturum jetonu (stateless) ──
// Çağıranlar config.adminToken'ı doğrulamış olmalı (checkLogin / verifyToken);
// boş anahtarla ASLA imza üretilmez — sabit bir yedek anahtar sahtelenebilirdi.
function sign(data: string): string {
  if (!config.adminToken) throw new Error('ADMIN_TOKEN unset — admin API disabled');
  return crypto.createHmac('sha256', config.adminToken).update(data).digest('hex');
}

export function issueToken(email: string): string {
  const e = email.trim().toLowerCase();
  const payload = `${Buffer.from(e).toString('base64url')}.${Date.now() + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** Geçerliyse jetonun sahibinin e-postasını, değilse null döner. */
export function verifyToken(token: string): string | null {
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
  try { return Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
}
