import { Hono } from 'hono';
import { db } from '../db/client';
import { invites } from '../db/schema';
import { requireMember, type MemberVars } from '../middleware/auth';
import { genRecoveryParts, hashSecret } from '../lib/auth';
import type { CreateInviteRequest, CreateInviteResponse, MemberRole } from '../../../shared/club-types';

export const invitesRoutes = new Hono<MemberVars>();
invitesRoutes.use('*', requireMember);

// Owner-only: mint a single-use invite code for one new member. The code is
// returned once; the owner shares it out-of-band.
invitesRoutes.post('/', async (c) => {
  if (c.get('role') !== 'owner') return c.json({ error: 'owner only' }, 403);
  const clubId = c.get('clubId');
  if (!clubId) return c.json({ error: 'not a club member' }, 403);

  const body = await c.req.json<CreateInviteRequest>().catch(() => ({}) as CreateInviteRequest);
  const role: MemberRole = body?.role === 'owner' ? 'owner' : 'member';
  const label = body?.label?.trim() || null;

  const rec = genRecoveryParts();
  await db.insert(invites).values({
    clubId,
    locator: rec.locator,
    secretHash: await hashSecret(rec.secret),
    role,
    label,
    createdByUserId: c.get('userId'),
  });

  const res: CreateInviteResponse = { code: rec.code, role, label };
  return c.json(res);
});
