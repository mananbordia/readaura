import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { memberships, users } from '../db/schema';
import { requireMember, type MemberVars } from '../middleware/auth';
import type { MemberDTO, MemberRole } from '../../../shared/club-types';

export const membersRoutes = new Hono<MemberVars>();
membersRoutes.use('*', requireMember);

// Owner-only: list the club's members (who has joined).
membersRoutes.get('/', async (c) => {
  if (c.get('role') !== 'owner') return c.json({ error: 'owner only' }, 403);
  const clubId = c.get('clubId');
  if (!clubId) return c.json([] as MemberDTO[]);

  const rows = await db
    .select({
      userId: memberships.userId,
      displayName: users.displayName,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.clubId, clubId))
    .orderBy(asc(memberships.joinedAt));

  const dtos: MemberDTO[] = rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    role: r.role as MemberRole,
    joinedAt: r.joinedAt.toISOString(),
  }));
  return c.json(dtos);
});
