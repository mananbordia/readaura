import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../lib/auth';
import type { MemberRole } from '../../../shared/club-types';

export type MemberVars = {
  Variables: { userId: string; clubId: string | null; role: MemberRole };
};

// Requires a valid member JWT (issued by /auth/join or /auth/recover). Identity
// is taken ONLY from the verified token — client-supplied ids are never trusted.
export const requireMember = createMiddleware<MemberVars>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = token ? await verifyToken(token) : null;
  if (!claims?.userId) return c.json({ error: 'unauthorized' }, 401);
  c.set('userId', claims.userId);
  c.set('clubId', claims.clubId);
  c.set('role', claims.role);
  await next();
});
