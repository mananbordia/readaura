import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { sharedAnnotations, users } from '../db/schema';
import { requireMember, type MemberVars } from '../middleware/auth';
import type {
  SharedAnnotationDTO,
  SharedAnnotationKind,
  SharedAnnotationPayload,
  ShareAnnotationRequest,
  TextQuoteAnchor,
} from '../../../shared/club-types';

const MAX_SELECTED = 4000;
const MAX_PAYLOAD = 200_000; // serialized thread cap

type AnnRow = {
  id: string;
  logicalId: string;
  authorId: string;
  authorName: string;
  kind: string;
  anchor: TextQuoteAnchor;
  selectedText: string;
  payload: SharedAnnotationPayload;
  clientId: string;
  updatedAt: Date;
  deletedAt: Date | null;
};

function toDTO(r: AnnRow): SharedAnnotationDTO {
  return {
    id: r.id,
    logicalId: r.logicalId,
    authorId: r.authorId,
    authorName: r.authorName,
    kind: r.kind as SharedAnnotationKind,
    anchor: r.anchor,
    selectedText: r.selectedText,
    payload: r.payload,
    clientId: r.clientId,
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

const listColumns = {
  id: sharedAnnotations.id,
  logicalId: sharedAnnotations.logicalId,
  authorId: sharedAnnotations.authorId,
  authorName: users.displayName,
  kind: sharedAnnotations.kind,
  anchor: sharedAnnotations.anchor,
  selectedText: sharedAnnotations.selectedText,
  payload: sharedAnnotations.payload,
  clientId: sharedAnnotations.clientId,
  updatedAt: sharedAnnotations.updatedAt,
  deletedAt: sharedAnnotations.deletedAt,
};

export const annotationsRoutes = new Hono<MemberVars>();
annotationsRoutes.use('*', requireMember);

// Upsert a shared annotation. Auto-shared when a member saves an explanation on
// a club doc; re-pushing the same local note (authorId, clientId) updates its
// row (and un-tombstones it) rather than duplicating.
annotationsRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const clubId = c.get('clubId');
  if (!clubId) return c.json({ error: 'not a club member' }, 403);

  const body = await c.req.json<ShareAnnotationRequest>().catch(() => null);
  if (!body?.logicalId || !body.clientId || !body.kind || !body.anchor || !body.payload) {
    return c.json({ error: 'missing required fields' }, 400);
  }
  if ((body.selectedText?.length ?? 0) > MAX_SELECTED) return c.json({ error: 'selection too long' }, 413);
  if (JSON.stringify(body.payload).length > MAX_PAYLOAD) return c.json({ error: 'payload too large' }, 413);

  const [row] = await db
    .insert(sharedAnnotations)
    .values({
      clubId,
      logicalId: body.logicalId,
      authorId: userId,
      kind: body.kind,
      anchor: body.anchor,
      selectedText: body.selectedText ?? '',
      payload: body.payload,
      clientId: body.clientId,
    })
    .onConflictDoUpdate({
      target: [sharedAnnotations.authorId, sharedAnnotations.clientId],
      set: {
        logicalId: body.logicalId,
        kind: body.kind,
        anchor: body.anchor,
        selectedText: body.selectedText ?? '',
        payload: body.payload,
        updatedAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();

  const [u] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return c.json(toDTO({ ...row, authorName: u?.displayName ?? 'Member' } as AnnRow));
});

// List non-deleted shared annotations for one doc (by logicalId) in this club.
annotationsRoutes.get('/', async (c) => {
  const clubId = c.get('clubId');
  if (!clubId) return c.json([] as SharedAnnotationDTO[]);
  const logicalId = c.req.query('logicalId');
  if (!logicalId) return c.json({ error: 'logicalId required' }, 400);

  const rows = await db
    .select(listColumns)
    .from(sharedAnnotations)
    .innerJoin(users, eq(users.id, sharedAnnotations.authorId))
    .where(
      and(
        eq(sharedAnnotations.clubId, clubId),
        eq(sharedAnnotations.logicalId, logicalId),
        isNull(sharedAnnotations.deletedAt),
      ),
    );
  return c.json(rows.map((r) => toDTO(r as AnnRow)));
});

// Unshare (reversible tombstone) by clientId — author-only.
annotationsRoutes.post('/delete', async (c) => {
  const userId = c.get('userId');
  const { clientId } = await c.req.json<{ clientId: string }>().catch(() => ({ clientId: '' }));
  if (!clientId) return c.json({ error: 'clientId required' }, 400);
  await db
    .update(sharedAnnotations)
    .set({ deletedAt: new Date() })
    .where(and(eq(sharedAnnotations.authorId, userId), eq(sharedAnnotations.clientId, clientId)));
  return c.json({ ok: true });
});
