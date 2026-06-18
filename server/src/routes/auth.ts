import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { clubs, invites, memberships, users } from '../db/schema';
import {
  genRecoveryParts,
  hashSecret,
  inviteCodeToHash,
  mintToken,
  parseRecoveryCode,
  verifySecret,
} from '../lib/auth';
import type {
  JoinRequest,
  JoinResponse,
  MemberRole,
  RecoverRequest,
  RecoverResponse,
} from '../../../shared/club-types';

export const authRoutes = new Hono();

// Throttle /join to blunt brute force of the short (6-char) invite codes.
// The Vercel proxy forwards the real client IP as x-club-client-ip, so we can
// bucket per-IP (one attacker can't lock everyone out) with a global backstop.
const PER_IP_MAX = 10;
const PER_IP_WINDOW_MS = 10 * 60_000;
const GLOBAL_MAX = 120;
const GLOBAL_WINDOW_MS = 60_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();
let globalCount = 0;
let globalResetAt = 0;

function joinAllowed(ip: string): boolean {
  const now = Date.now();
  if (now > globalResetAt) {
    globalCount = 0;
    globalResetAt = now + GLOBAL_WINDOW_MS;
  }
  globalCount += 1;
  if (globalCount > GLOBAL_MAX) return false;

  if (ipHits.size > 10_000) ipHits.clear(); // bound memory under a distributed flood
  let e = ipHits.get(ip);
  if (!e || now > e.resetAt) {
    e = { count: 0, resetAt: now + PER_IP_WINDOW_MS };
    ipHits.set(ip, e);
  }
  e.count += 1;
  return e.count <= PER_IP_MAX;
}

// Join with a SINGLE-USE 6-char invite code. The invite is consumed atomically
// (so it can't be redeemed twice) and its role is granted. A fresh one-time
// recovery code is returned, shown to the user exactly once.
authRoutes.post('/join', async (c) => {
  const ip = c.req.header('x-club-client-ip') || 'unknown';
  if (!joinAllowed(ip)) return c.json({ error: 'too many attempts, try again shortly' }, 429);
  const body = await c.req.json<JoinRequest>().catch(() => null);
  if (!body?.inviteCode || !body.displayName?.trim()) {
    return c.json({ error: 'inviteCode and displayName required' }, 400);
  }
  const codeHash = inviteCodeToHash(body.inviteCode);
  if (!codeHash) return c.json({ error: 'invalid invite code' }, 401);

  const [club] = await db.select().from(clubs).limit(1);
  if (!club) return c.json({ error: 'no club configured' }, 503);

  const displayName = body.displayName.trim().slice(0, 80);
  const rec = genRecoveryParts();
  const recoveryHash = await hashSecret(rec.secret);

  const outcome = await db
    .transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(invites)
        .where(and(eq(invites.clubId, club.id), eq(invites.codeHash, codeHash)))
        .limit(1);
      if (!invite || invite.usedAt) return { error: 'invalid or already-used invite', status: 401 as const };
      if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
        return { error: 'invite expired', status: 401 as const };
      }

      const [user] = await tx
        .insert(users)
        .values({ displayName, recoveryLocator: rec.locator, recoveryHash })
        .returning();

      // Consume atomically: only succeeds if still unused (guards concurrent redeem).
      const consumed = await tx
        .update(invites)
        .set({ usedAt: new Date(), usedByUserId: user.id, code: null }) // clear plaintext once used
        .where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
        .returning();
      if (consumed.length === 0) throw new Error('invite-race'); // rolls back the user insert

      const role = (invite.role as MemberRole) ?? 'member';
      await tx.insert(memberships).values({ userId: user.id, clubId: club.id, role });
      return { user, role };
    })
    .catch((e) => {
      if (e instanceof Error && e.message === 'invite-race') {
        return { error: 'invite already used', status: 409 as const };
      }
      throw e;
    });

  if ('error' in outcome) return c.json({ error: outcome.error }, outcome.status);

  const token = await mintToken({
    userId: outcome.user.id,
    clubId: club.id,
    role: outcome.role,
    displayName: outcome.user.displayName,
  });
  const res: JoinResponse = {
    token,
    userId: outcome.user.id,
    displayName: outcome.user.displayName,
    role: outcome.role,
    recoveryCode: rec.code,
  };
  return c.json(res);
});

// Reclaim the same userId after a browser wipe by re-entering the recovery
// code. Rotates the code on success (single-use).
// TODO(phase2): rate-limit per locator + source IP to slow brute force.
authRoutes.post('/recover', async (c) => {
  const body = await c.req.json<RecoverRequest>().catch(() => null);
  const parsed = body?.recoveryCode ? parseRecoveryCode(body.recoveryCode) : null;
  if (!parsed) return c.json({ error: 'invalid recovery code' }, 400);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.recoveryLocator, parsed.locator))
    .limit(1);
  if (!user || !(await verifySecret(user.recoveryHash, parsed.secret))) {
    return c.json({ error: 'invalid recovery code' }, 401);
  }

  const rec = genRecoveryParts();
  const recoveryHash = await hashSecret(rec.secret);
  await db
    .update(users)
    .set({ recoveryLocator: rec.locator, recoveryHash, recoveryRotatedAt: new Date() })
    .where(eq(users.id, user.id));

  const [m] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);
  const role = (m?.role as MemberRole | undefined) ?? 'member';

  const token = await mintToken({
    userId: user.id,
    clubId: m?.clubId ?? null,
    role,
    displayName: user.displayName,
  });
  const res: RecoverResponse = {
    token,
    userId: user.id,
    displayName: user.displayName,
    role,
    recoveryCode: rec.code,
  };
  return c.json(res);
});
