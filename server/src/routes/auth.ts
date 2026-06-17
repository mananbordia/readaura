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

// Coarse global throttle for /join — blunts brute force of the short (6-char)
// invite codes. Legitimate joins are rare, so a generous cap never bites real
// use. (Per-IP isn't meaningful here: all requests arrive via the Vercel proxy.)
const JOIN_WINDOW_MS = 60_000;
const JOIN_MAX = 30;
let joinCount = 0;
let joinResetAt = 0;
function joinAllowed(): boolean {
  const now = Date.now();
  if (now > joinResetAt) {
    joinCount = 0;
    joinResetAt = now + JOIN_WINDOW_MS;
  }
  joinCount += 1;
  return joinCount <= JOIN_MAX;
}

// Join with a SINGLE-USE 6-char invite code. The invite is consumed atomically
// (so it can't be redeemed twice) and its role is granted. A fresh one-time
// recovery code is returned, shown to the user exactly once.
authRoutes.post('/join', async (c) => {
  if (!joinAllowed()) return c.json({ error: 'too many attempts, try again shortly' }, 429);
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

      const [user] = await tx
        .insert(users)
        .values({ displayName, recoveryLocator: rec.locator, recoveryHash })
        .returning();

      // Consume atomically: only succeeds if still unused (guards concurrent redeem).
      const consumed = await tx
        .update(invites)
        .set({ usedAt: new Date(), usedByUserId: user.id })
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
