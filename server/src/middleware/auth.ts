import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { verifyToken } from '../lib/auth';
import type { MemberRole } from '../../../shared/club-types';

export type MemberVars = {
  Variables: { userId: string; clubId: string | null; role: MemberRole };
};

// Requires a valid member JWT (issued by /auth/join or /auth/recover). Identity
// is taken ONLY from the verified token — client-supplied ids are never trusted.
// We also confirm the user still exists, so a token for a removed account fails
// cleanly with 401 (re-auth) instead of FK-violating downstream into a 500.
export const requireMember = createMiddleware<MemberVars>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = token ? await verifyToken(token) : null;
  if (!claims?.userId) return c.json({ error: 'unauthorized' }, 401);

  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, claims.userId)).limit(1);
  if (!u) return c.json({ error: 'session expired — please re-join or recover' }, 401);

  c.set('userId', claims.userId);
  c.set('clubId', claims.clubId);
  c.set('role', claims.role);
  await next();
});
