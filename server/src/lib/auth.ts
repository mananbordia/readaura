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
