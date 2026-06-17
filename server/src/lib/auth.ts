import { createHmac, randomBytes } from 'node:crypto';
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

// ---- Invite codes: short, shareable 6-char codes --------------------------
// Single-use + owner-minted + consumed on first redeem, so they don't need
// recovery-grade entropy. 6 Crockford base32 chars (no ambiguous I/L/O/U) ≈
// 30 bits, stored as SHA-256 for fast indexed lookup. /join is throttled to
// blunt brute force; invites are only valid while outstanding (rarely many).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += CROCKFORD[bytes[i] & 31];
  return out;
}

// Keyed (peppered) hash. A DB leak ALONE can't brute-force the low-entropy
// codes — the pepper (CLUB_JWT_SECRET) lives only in env, never in the database.
// Still fast + indexable, so /join stays O(1) (no per-attempt KDF cost on the
// shared 1-vCPU box). Brute force over time is bounded by invite expiry + the
// /join throttle.
function inviteHmac(s: string): string {
  return createHmac('sha256', env.CLUB_JWT_SECRET).update(s).digest('hex');
}

export function genInviteCode(): { code: string; codeHash: string } {
  const code = randomBase32(6);
  return { code, codeHash: inviteHmac(code) };
}

// Normalize a pasted/typed code (case, O->0, I/L->1, strip separators) and
// return its keyed hash — or null if it isn't 6 valid characters.
export function inviteCodeToHash(input: string): string | null {
  const norm = input
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
  if (norm.length !== 6) return null;
  return inviteHmac(norm);
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
