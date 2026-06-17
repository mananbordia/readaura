import { randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';
import type { MemberRole } from '../../../shared/club-types';

const jwtSecret = new TextEncoder().encode(env.CLUB_JWT_SECRET);

// ---- One-time recovery code: `locator.secret` -----------------------------
// `locator` is a public lookup key (stored plaintext, indexed). `secret` is
// ~160 bits, stored only as an argon2 hash. Both rotate on each recovery, so a
// used code can't be replayed.

export function genRecoveryParts(): { locator: string; secret: string; code: string } {
  const locator = randomBytes(6).toString('hex');
  const secret = randomBytes(20).toString('base64url');
  return { locator, secret, code: `${locator}.${secret}` };
}

export function parseRecoveryCode(code: string): { locator: string; secret: string } | null {
  const trimmed = code.trim();
  const i = trimmed.indexOf('.');
  if (i <= 0 || i >= trimmed.length - 1) return null;
  return { locator: trimmed.slice(0, i), secret: trimmed.slice(i + 1) };
}

// ---- Invite codes: short, readable, product-key style ---------------------
// Single-use + owner-minted + consumed on first redeem, so they don't need
// recovery-grade entropy. 6-char locator (lookup) + 10-char secret (hashed),
// Crockford base32 (no ambiguous I/L/O/U), shown grouped as XXXX-XXXX-XXXX-XXXX.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += CROCKFORD[bytes[i] & 31];
  return out;
}

export function genInviteCode(): { locator: string; secret: string; code: string } {
  const locator = randomBase32(6);
  const secret = randomBase32(10);
  const code = (locator + secret).replace(/(.{4})(?=.)/g, '$1-');
  return { locator, secret, code };
}

export function parseInviteCode(code: string): { locator: string; secret: string } | null {
  const norm = code
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
  if (norm.length !== 16) return null;
  return { locator: norm.slice(0, 6), secret: norm.slice(6) };
}

export function hashSecret(secret: string): Promise<string> {
  return argonHash(secret);
}

export async function verifySecret(stored: string, secret: string): Promise<boolean> {
  try {
    return await argonVerify(stored, secret);
  } catch {
    return false;
  }
}

// ---- Member JWTs ----------------------------------------------------------

export type TokenClaims = {
  userId: string;
  clubId: string | null;
  role: MemberRole;
  displayName: string;
};

export function mintToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({
    clubId: claims.clubId,
    role: claims.role,
    displayName: claims.displayName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(jwtSecret);
}

export async function verifyToken(token: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    return {
      userId: String(payload.sub ?? ''),
      clubId: (payload.clubId as string | null) ?? null,
      role: (payload.role as MemberRole) ?? 'member',
      displayName: (payload.displayName as string) ?? '',
    };
  } catch {
    return null;
  }
}
