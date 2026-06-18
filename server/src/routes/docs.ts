import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { docVersions, publishedDocs, users } from '../db/schema';
import { requireMember, type MemberVars } from '../middleware/auth';
import { blobExists, getBlob, putBlob, sha256Hex } from '../lib/blobstore';
import type {
  ClubFileType,
  PublishRequest,
  PublishedDocDTO,
} from '../../../shared/club-types';

const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_BLOB = 25 * 1024 * 1024; // 25 MB hard cap (Vercel proxy ~4.5MB is the real limit)

type DocRow = {
  logicalId: string;
  contentHash: string;
  title: string;
  tags: string[];
  fileType: string;
  snapshotFormatVersion: number;
  publishedAt: Date;
  updatedAt: Date;
  publisherId: string;
  publisherName: string;
};

function toDTO(r: DocRow): PublishedDocDTO {
  return {
    logicalId: r.logicalId,
    contentHash: r.contentHash,
    title: r.title,
    tags: r.tags ?? [],
    fileType: r.fileType as ClubFileType,
    snapshotFormatVersion: r.snapshotFormatVersion,
    publisherId: r.publisherId,
    publisherName: r.publisherName,
    publishedAt: r.publishedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const discoverColumns = {
  logicalId: publishedDocs.logicalId,
  contentHash: publishedDocs.contentHash,
  title: publishedDocs.title,
  tags: publishedDocs.tags,
  fileType: publishedDocs.fileType,
  snapshotFormatVersion: publishedDocs.snapshotFormatVersion,
  publishedAt: publishedDocs.publishedAt,
  updatedAt: publishedDocs.updatedAt,
  publisherId: publishedDocs.publisherId,
  publisherName: users.displayName,
};

// ---- /docs ---------------------------------------------------------------

export const docsRoutes = new Hono<MemberVars>();
docsRoutes.use('*', requireMember);

// Publish a content-hash snapshot. DOCX/TXT carry rendered HTML inline (stored
// as a blob keyed by its hash); PDFs upload bytes first via PUT /blobs/:hash.
docsRoutes.post('/publish', async (c) => {
  const userId = c.get('userId');
  const clubId = c.get('clubId');
  if (!clubId) return c.json({ error: 'not a club member' }, 403);

  const body = await c.req.json<PublishRequest>().catch(() => null);
  if (!body?.contentHash || !body.logicalId || !body.title?.trim() || !body.fileType) {
    return c.json({ error: 'missing required fields' }, 400);
  }
  if (!HASH_RE.test(body.contentHash)) return c.json({ error: 'bad content hash' }, 400);

  // Author-only update: once a logicalId exists, only its original publisher
  // (or an owner) may add a new version. Others must fork (publish a new copy
  // under their own logicalId), which the client does for opened docs.
  const [priorForLogical] = await db
    .select({ publisherId: publishedDocs.publisherId })
    .from(publishedDocs)
    .where(and(eq(publishedDocs.clubId, clubId), eq(publishedDocs.logicalId, body.logicalId)))
    .limit(1);
  if (priorForLogical && priorForLogical.publisherId !== userId && c.get('role') !== 'owner') {
    return c.json({ error: 'only the original publisher can update this doc' }, 403);
  }

  if (body.fileType === 'docx' || body.fileType === 'txt') {
    if (typeof body.snapshotHtml !== 'string') {
      return c.json({ error: 'snapshotHtml required for docx/txt' }, 400);
    }
    const bytes = new TextEncoder().encode(body.snapshotHtml);
    if (sha256Hex(bytes) !== body.contentHash) {
      return c.json({ error: 'content hash mismatch' }, 422);
    }
    if (!(await blobExists(body.contentHash))) await putBlob(body.contentHash, bytes);
  } else {
    // PDF: bytes must already have been uploaded via PUT /blobs/:hash
    if (!(await blobExists(body.contentHash))) {
      return c.json({ error: 'blob not uploaded' }, 409);
    }
  }

  const tags = (body.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const [existing] = await db
    .select()
    .from(publishedDocs)
    .where(and(eq(publishedDocs.clubId, clubId), eq(publishedDocs.contentHash, body.contentHash)))
    .limit(1);

  let row;
  if (existing) {
    // Identical content already published (possibly by someone else): merge
    // tags and un-tombstone (re-publish), keeping the original logicalId.
    const mergedTags = Array.from(new Set([...(existing.tags ?? []), ...tags]));
    [row] = await db
      .update(publishedDocs)
      .set({ title: body.title.trim(), tags: mergedTags, unpublishedAt: null, updatedAt: new Date() })
      .where(eq(publishedDocs.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(publishedDocs)
      .values({
        clubId,
        logicalId: body.logicalId,
        contentHash: body.contentHash,
        title: body.title.trim(),
        tags,
        fileType: body.fileType,
        snapshotFormatVersion: body.snapshotFormatVersion,
        blobKey: body.contentHash,
        publisherId: userId,
      })
      .returning();
  }

  // Append to the version lineage if this (logicalId, hash) is new.
  const [ver] = await db
    .select({ id: docVersions.id })
    .from(docVersions)
    .where(and(eq(docVersions.logicalId, row.logicalId), eq(docVersions.contentHash, row.contentHash)))
    .limit(1);
  if (!ver) {
    await db.insert(docVersions).values({
      logicalId: row.logicalId,
      contentHash: row.contentHash,
      publisherId: userId,
    });
  }

  return c.json({ ok: true, logicalId: row.logicalId, contentHash: row.contentHash });
});

// Reversible unpublish (tombstone). Re-publishing the same hash clears it.
docsRoutes.post('/unpublish', async (c) => {
  const userId = c.get('userId');
  const clubId = c.get('clubId');
  if (!clubId) return c.json({ error: 'not a club member' }, 403);
  const { logicalId } = (await c.req.json<{ logicalId: string }>().catch(() => ({ logicalId: '' })));
  if (!logicalId) return c.json({ error: 'logicalId required' }, 400);

  await db
    .update(publishedDocs)
    .set({ unpublishedAt: new Date() })
    .where(
      and(
        eq(publishedDocs.clubId, clubId),
        eq(publishedDocs.logicalId, logicalId),
        eq(publishedDocs.publisherId, userId),
      ),
    );
  return c.json({ ok: true });
});

// Discover: the latest non-unpublished snapshot per logicalId.
docsRoutes.get('/', async (c) => {
  const clubId = c.get('clubId');
  if (!clubId) return c.json([] as PublishedDocDTO[]);

  const rows = await db
    .select(discoverColumns)
    .from(publishedDocs)
    .innerJoin(users, eq(users.id, publishedDocs.publisherId))
    .where(and(eq(publishedDocs.clubId, clubId), isNull(publishedDocs.unpublishedAt)));

  const latest = new Map<string, DocRow>();
  for (const r of rows) {
    const prev = latest.get(r.logicalId);
    if (!prev || r.updatedAt > prev.updatedAt) latest.set(r.logicalId, r);
  }
  return c.json([...latest.values()].map(toDTO));
});

// Open: metadata + latest contentHash for one logicalId. The client then GETs
// /blobs/:contentHash to pull the snapshot and cache it into IndexedDB.
docsRoutes.get('/:logicalId', async (c) => {
  const clubId = c.get('clubId');
  const logicalId = c.req.param('logicalId');
  if (!clubId) return c.json({ error: 'not a club member' }, 403);

  const rows = await db
    .select(discoverColumns)
    .from(publishedDocs)
    .innerJoin(users, eq(users.id, publishedDocs.publisherId))
    .where(
      and(
        eq(publishedDocs.clubId, clubId),
        eq(publishedDocs.logicalId, logicalId),
        isNull(publishedDocs.unpublishedAt),
      ),
    );
  if (rows.length === 0) return c.json({ error: 'not found' }, 404);
  const latest = rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return c.json(toDTO(latest));
});

// ---- /blobs --------------------------------------------------------------

export const blobsRoutes = new Hono<MemberVars>();
blobsRoutes.use('*', requireMember);

blobsRoutes.on('HEAD', '/:hash', async (c) => {
  const hash = c.req.param('hash');
  return c.body(null, (await blobExists(hash)) ? 200 : 404);
});

blobsRoutes.put('/:hash', async (c) => {
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.json({ error: 'bad hash' }, 400);
  if (await blobExists(hash)) return c.json({ ok: true, deduped: true });

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength > MAX_BLOB) return c.json({ error: 'blob too large' }, 413);
  if (sha256Hex(bytes) !== hash) return c.json({ error: 'hash mismatch' }, 422);
  await putBlob(hash, bytes);
  return c.json({ ok: true });
});

blobsRoutes.get('/:hash', async (c) => {
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.json({ error: 'bad hash' }, 400);
  const buf = await getBlob(hash);
  if (!buf) return c.json({ error: 'not found' }, 404);
  // A snapshot blob is UNTRUSTED cross-user content (another member's rendered
  // DOCX/TXT HTML, or a PDF). Serve it inert so navigating straight to this URL
  // can never be sniffed/rendered as HTML and execute scripts. The client reads
  // it via fetch() (Content-Type is irrelevant to fetch) and sanitizes the HTML
  // before injecting it into the DOM — see the open-into-IndexedDB flow.
  c.header('Content-Type', 'application/octet-stream');
  c.header('Content-Disposition', 'attachment');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Security-Policy', "default-src 'none'; sandbox");
  c.header('ETag', `"${hash}"`);
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  return c.body(new Uint8Array(buf));
});
