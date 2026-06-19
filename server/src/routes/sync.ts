import { Hono } from 'hono';
import { and, eq, gt, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { personalSync } from '../db/schema';
import { requireMember, type MemberVars } from '../middleware/auth';
import { getPersonalBlob, personalBlobExists, putPersonalBlob, sha256Hex } from '../lib/blobstore';
import type {
  SyncEnvelope,
  SyncKind,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
} from '../../../shared/club-types';

// Personal sync: an opt-in, account-level mirror of a member's local library.
// A SEPARATE lane from clubs. Deletes propagate ONLY via explicit tombstones in
// the push (action: 'delete') — never inferred from a key being absent — so a
// fresh/recovered device (empty outbox) can only ever pull/restore, never wipe.

const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_BLOB = 25 * 1024 * 1024;
const MAX_ITEMS = 500;
const MAX_ENVELOPE = 2 * 1024 * 1024;
const EMPTY_ENVELOPE: SyncEnvelope = { formatVersion: 1, enc: 'none', payload: null };

export const syncRoutes = new Hono<MemberVars>();
syncRoutes.use('*', requireMember);

// Pull rows changed since the cursor (tombstones included so deletes apply).
syncRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const since = c.req.query('since');
  const sinceDate = since ? new Date(since) : null;
  const fresh = sinceDate && !Number.isNaN(sinceDate.getTime());

  const rows = await db
    .select({
      kind: personalSync.kind,
      key: personalSync.key,
      payload: personalSync.payload,
      updatedAt: personalSync.updatedAt,
      deletedAt: personalSync.deletedAt,
    })
    .from(personalSync)
    .where(fresh
      ? and(eq(personalSync.userId, userId), gt(personalSync.updatedAt, sinceDate as Date))
      : eq(personalSync.userId, userId));

  const res: SyncPullResponse = {
    rows: rows.map((r) => ({
      kind: r.kind as SyncKind,
      key: r.key,
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      envelope: r.deletedAt ? null : (r.payload as SyncEnvelope),
    })),
    serverTime: new Date().toISOString(),
  };
  return c.json(res);
});

// Push a batch of local changes. Last-write-wins by updatedAt; 'delete' sets a
// tombstone. Upsert is conditional (only overwrite when the incoming row is at
// least as new) so a stale device can't clobber a newer cloud version.
syncRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<SyncPushRequest>().catch(() => null);
  if (!body?.items || !Array.isArray(body.items)) return c.json({ error: 'items required' }, 400);
  if (body.items.length > MAX_ITEMS) return c.json({ error: 'too many items' }, 413);

  try {
    await db.transaction(async (tx) => {
      for (const it of body.items) {
        if (!it.kind || !it.key || !it.updatedAt) continue;
        const updatedAt = new Date(it.updatedAt);
        if (Number.isNaN(updatedAt.getTime())) continue;
        const isDelete = it.action === 'delete';
        const envelope = isDelete ? null : it.envelope;
        if (!isDelete) {
          if (!envelope) continue;
          if (JSON.stringify(envelope).length > MAX_ENVELOPE) throw new Error('envelope too large');
        }
        const stored = envelope ?? EMPTY_ENVELOPE;
        await tx
          .insert(personalSync)
          .values({
            userId,
            kind: it.kind,
            key: it.key,
            formatVersion: stored.formatVersion,
            enc: stored.enc,
            payload: stored,
            updatedAt,
            deletedAt: isDelete ? updatedAt : null,
          })
          .onConflictDoUpdate({
            target: [personalSync.userId, personalSync.kind, personalSync.key],
            set: {
              formatVersion: stored.formatVersion,
              enc: stored.enc,
              payload: stored,
              updatedAt,
              deletedAt: isDelete ? updatedAt : null,
            },
            setWhere: lte(personalSync.updatedAt, updatedAt), // newer (or equal) wins
          });
      }
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'push failed' }, 400);
  }

  const res: SyncPushResponse = { ok: true, serverTime: new Date().toISOString() };
  return c.json(res);
});

// ---- Per-account private file blobs (content-addressed) ------------------

syncRoutes.on('HEAD', '/blobs/:hash', async (c) => {
  return c.body(null, (await personalBlobExists(c.get('userId'), c.req.param('hash'))) ? 200 : 404);
});

syncRoutes.put('/blobs/:hash', async (c) => {
  const userId = c.get('userId');
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.json({ error: 'bad hash' }, 400);
  if (await personalBlobExists(userId, hash)) return c.json({ ok: true, deduped: true });
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength > MAX_BLOB) return c.json({ error: 'blob too large' }, 413);
  if (sha256Hex(bytes) !== hash) return c.json({ error: 'hash mismatch' }, 422);
  await putPersonalBlob(userId, hash, bytes);
  return c.json({ ok: true });
});

syncRoutes.get('/blobs/:hash', async (c) => {
  const userId = c.get('userId');
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.json({ error: 'bad hash' }, 400);
  const buf = await getPersonalBlob(userId, hash);
  if (!buf) return c.json({ error: 'not found' }, 404);
  c.header('Content-Type', 'application/octet-stream');
  c.header('Content-Disposition', 'attachment');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'private, max-age=31536000, immutable');
  return c.body(new Uint8Array(buf));
});
