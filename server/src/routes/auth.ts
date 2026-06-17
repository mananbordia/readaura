import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { verify as argonVerify } from '@node-rs/argon2';
import { db } from '../db/client';
import { clubs, memberships, users } from '../db/schema';
import {
  genRecoveryParts,
  hashSecret,
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

// Join the (single) club with an invite code; mint a member JWT + a one-time
// recovery code shown to the user exactly once.
authRoutes.post('/join', async (c) => {
  const body = await c.req.json<JoinRequest>().catch(() => null);
  if (!body?.inviteCode || !body.displayName?.trim()) {
    return c.json({ error: 'inviteCode and displayName required' }, 400);
  }

  const [club] = await db.select().from(clubs).limit(1);
  if (!club) return c.json({ error: 'no club configured' }, 503);

  const inviteOk = await argonVerify(club.inviteCodeHash, body.inviteCode).catch(() => false);
  if (!inviteOk) return c.json({ error: 'invalid invite code' }, 401);

  const rec = genRecoveryParts();
  const recoveryHash = await hashSecret(rec.secret);
  const [user] = await db
    .insert(users)
    .values({
      displayName: body.displayName.trim().slice(0, 80),
      recoveryLocator: rec.locator,
      recoveryHash,
    })
    .returning();

  await db
    .insert(memberships)
    .values({ userId: user.id, clubId: club.id, role: 'member' })
    .onConflictDoNothing();

  const token = await mintToken({
    userId: user.id,
    clubId: club.id,
    role: 'member',
    displayName: user.displayName,
  });
  const res: JoinResponse = {
    token,
    userId: user.id,
    displayName: user.displayName,
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

  const token = await mintToken({
    userId: user.id,
    clubId: m?.clubId ?? null,
    role: (m?.role as MemberRole | undefined) ?? 'member',
    displayName: user.displayName,
  });
  const res: RecoverResponse = {
    token,
    userId: user.id,
    displayName: user.displayName,
    recoveryCode: rec.code,
  };
  return c.json(res);
});
