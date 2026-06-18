import { Hono } from 'hono';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import { invites } from '../db/schema';
import { requireMember, type MemberVars } from '../middleware/auth';
import { genInviteCode } from '../lib/auth';
import type {
  CreateInviteRequest,
  CreateInviteResponse,
  InviteDTO,
  MemberRole,
} from '../../../shared/club-types';

export const invitesRoutes = new Hono<MemberVars>();
invitesRoutes.use('*', requireMember);

// Owner-only: mint a single-use invite code for one new member. The plaintext
// code is stored alongside its hash so the owner can see/re-share pending
// invites (cleared on join); the code is also returned here.
invitesRoutes.post('/', async (c) => {
  if (c.get('role') !== 'owner') return c.json({ error: 'owner only' }, 403);
  const clubId = c.get('clubId');
  if (!clubId) return c.json({ error: 'not a club member' }, 403);

  const body = await c.req.json<CreateInviteRequest>().catch(() => ({}) as CreateInviteRequest);
  const role: MemberRole = body?.role === 'owner' ? 'owner' : 'member';

  const rec = genInviteCode();
  await db.insert(invites).values({
    clubId,
    codeHash: rec.codeHash,
    code: rec.code,
    role,
    createdByUserId: c.get('userId'),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72h to redeem
  });

  const res: CreateInviteResponse = { code: rec.code, role, label: null };
  return c.json(res);
});

// Owner-only: list the active (unused, unexpired) invites with their codes and
// remaining time so the owner can track/re-share pending invites.
invitesRoutes.get('/', async (c) => {
  if (c.get('role') !== 'owner') return c.json({ error: 'owner only' }, 403);
  const clubId = c.get('clubId');
  if (!clubId) return c.json([] as InviteDTO[]);

  const rows = await db
    .select({
      id: invites.id,
      code: invites.code,
      role: invites.role,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.clubId, clubId),
        isNull(invites.usedAt),
        or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(invites.createdAt));

  const dtos: InviteDTO[] = rows
    .filter((r) => r.code) // legacy invites minted before plaintext was stored have no code to show
    .map((r) => ({
      id: r.id,
      code: r.code as string,
      role: r.role as MemberRole,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  return c.json(dtos);
});
