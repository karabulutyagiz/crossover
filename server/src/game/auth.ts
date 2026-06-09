// Verifies "Sign in with Apple" and "Continue with Google" identity tokens.
//
// Both providers issue an RS256-signed JWT. We fetch the provider's public keys
// (JWKS), verify the signature with Node's built-in crypto (no extra deps —
// createPublicKey supports importing a JWK directly), and validate the standard
// claims (iss / aud / exp). Returns the stable subject id + email on success.
import crypto from 'node:crypto';

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

// Cache JWKS per URL for an hour so we don't hit Apple/Google on every login.
const jwksCache = new Map<string, { keys: Jwk[]; expiresAt: number }>();

async function getJwks(url: string): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
  const json = (await res.json()) as { keys: Jwk[] };
  jwksCache.set(url, { keys: json.keys, expiresAt: Date.now() + 3_600_000 });
  return json.keys;
}

function decodeSegment(seg: string): any {
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

interface VerifiedToken {
  sub: string;
  email?: string;
  name?: string;
}

async function verifyJwt(
  token: string,
  jwksUrl: string,
  opts: { iss: string[]; aud: string[] },
): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [h, p, s] = parts as [string, string, string];
  const header = decodeSegment(h);
  const payload = decodeSegment(p);

  const keys = await getJwks(jwksUrl);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');

  const pubKey = crypto.createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
  const ok = crypto.verify('RS256', Buffer.from(`${h}.${p}`), pubKey, Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('Invalid signature');

  if (!opts.iss.includes(payload.iss)) throw new Error('Unexpected issuer');
  if (!payload.aud || !opts.aud.includes(payload.aud)) throw new Error('Unexpected audience');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('Token expired');

  return payload;
}

// aud for Apple native sign-in is the app's bundle identifier.
const APPLE_AUD = (process.env.APPLE_BUNDLE_ID ?? 'com.crossover.football')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// aud for Google is the OAuth client id(s) the token was minted for (iOS client
// id, and/or web client id). Comma-separated in GOOGLE_CLIENT_IDS.
const GOOGLE_AUD = (process.env.GOOGLE_CLIENT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function verifyAppleToken(idToken: string): Promise<VerifiedToken> {
  const payload = await verifyJwt(idToken, 'https://appleid.apple.com/auth/keys', {
    iss: ['https://appleid.apple.com'],
    aud: APPLE_AUD,
  });
  return { sub: String(payload.sub), email: payload.email };
}

export async function verifyGoogleToken(idToken: string): Promise<VerifiedToken> {
  if (GOOGLE_AUD.length === 0) throw new Error('GOOGLE_CLIENT_IDS env not configured');
  const payload = await verifyJwt(idToken, 'https://www.googleapis.com/oauth2/v3/certs', {
    iss: ['accounts.google.com', 'https://accounts.google.com'],
    aud: GOOGLE_AUD,
  });
  return { sub: String(payload.sub), email: payload.email, name: payload.name };
}

// aud for Facebook Limited Login is the Facebook App ID.
const FACEBOOK_AUD = (process.env.FACEBOOK_APP_ID ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function verifyFacebookToken(idToken: string): Promise<VerifiedToken> {
  if (FACEBOOK_AUD.length === 0) throw new Error('FACEBOOK_APP_ID env not configured');
  // Facebook "Limited Login" issues an OIDC JWT verifiable via its JWKS.
  const payload = await verifyJwt(idToken, 'https://limited.facebook.com/.well-known/oauth/openid/jwks/', {
    iss: ['https://www.facebook.com', 'https://facebook.com'],
    aud: FACEBOOK_AUD,
  });
  return { sub: String(payload.sub), email: payload.email, name: payload.name };
}
