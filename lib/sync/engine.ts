// Personal-sync engine (account-level library mirror). Club code, so it's only
// ever loaded via a CLUB_BUILD-gated dynamic import — never in the flag-off
// bundle. Pushes the local outbox, then pulls remote changes (LWW). Deletes
// flow ONLY through explicit outbox tombstones, so a fresh/recovered device
// (empty outbox) can only restore, never wipe the cloud.

import { clubApi } from '@/lib/club/api';
import { readClubSession } from '@/lib/use-club';
import { sha256Hex } from '@/lib/club/hash';
import {
  getSyncMeta,
  setSyncMeta,
  listOutbox,
  clearOutboxOps,
  clearOutbox,
  enqueueAllDocsForBackfill,
  applyRemoteDocBundle,
  applyRemoteDelete,
  getDocument,
  getFile,
  getHtmlOverride,
  listExplanations,
} from '@/lib/storage';
import type { SyncDocBundle } from '@/lib/types';
import type { SyncPushItem } from '@/shared/club-types';
import { MAX_SYNC_BLOB_BYTES } from '@/lib/sync-limits';

const FORMAT_VERSION = 1;
const BATCH = 500;

// Build the bundle + file blob for a local doc (null if it's gone).
async function buildBundle(docId: string): Promise<{ bundle: SyncDocBundle; blob: Blob } | null> {
  const doc = await getDocument(docId);
  if (!doc) return null;
  const blob = await getFile(docId);
  if (!blob) return null;
  const fileHash = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
  return {
    bundle: {
      doc,
      fileHash,
      fileMime: blob.type || 'application/octet-stream',
      htmlOverride: await getHtmlOverride(docId),
      explanations: await listExplanations(docId),
    },
    blob,
  };
}

let running = false;

// One sync cycle: push the outbox, then pull + apply remote changes. Returns
// counts, or null if signed-out / disabled / already running.
export async function syncNow(): Promise<{ pushed: number; pulled: number; skippedTooLarge: number } | null> {
  const session = readClubSession();
  if (!session || session.expired) return null; // signed out, or token rejected (awaiting reconnect)
  const meta = await getSyncMeta();
  if (!meta.enabled || running) return null;
  running = true;
  try {
    // ---- PUSH: drain the outbox (latest action per doc) ----
    const ops = await listOutbox();
    const latest = new Map<string, 'put' | 'delete'>();
    const order = new Map<string, string>();
    for (const op of ops) {
      const prev = order.get(op.key);
      if (!prev || op.createdAt >= prev) { latest.set(op.key, op.action); order.set(op.key, op.createdAt); }
    }
    const now = new Date().toISOString();
    const items: SyncPushItem[] = [];
    // Docs we couldn't push this cycle (blob over the gateway limit, or a transient
    // upload error). We KEEP their outbox ops so they retry later, but never let
    // one of them throw and abort the whole push+pull cycle.
    const skipped = new Set<string>();
    for (const [key, action] of latest) {
      if (action === 'delete') {
        items.push({ kind: 'document', key, action: 'delete', updatedAt: now, envelope: null });
        continue;
      }
      const built = await buildBundle(key);
      if (!built) {
        items.push({ kind: 'document', key, action: 'delete', updatedAt: now, envelope: null });
        continue;
      }
      if (built.blob.size > MAX_SYNC_BLOB_BYTES) { skipped.add(key); continue; } // too big for the gateway — leave local
      try {
        if (!(await clubApi.syncBlobExists(session.token, built.bundle.fileHash))) {
          await clubApi.putSyncBlob(session.token, built.bundle.fileHash, built.blob);
        }
      } catch {
        skipped.add(key); // upload failed (e.g. a 413) — don't wedge the cycle on one doc
        continue;
      }
      items.push({
        kind: 'document', key, action: 'put', updatedAt: now,
        envelope: { formatVersion: FORMAT_VERSION, enc: 'none', payload: built.bundle },
      });
    }
    for (let i = 0; i < items.length; i += BATCH) {
      const res = await clubApi.pushSync(session.token, { items: items.slice(i, i + BATCH) });
      await setSyncMeta({ lastPushedAt: res.serverTime });
    }
    // Clear only consumed ops (pushed/deleted); keep skipped ones so they're
    // retried, not lost — the size guard above makes each retry a cheap local no-op.
    const consumedIds = ops.filter((o) => !skipped.has(o.key)).map((o) => o.id);
    if (consumedIds.length > 0) await clearOutboxOps(consumedIds);
    const pushed = items.length;

    // ---- PULL: apply remote changes since the cursor (incl. tombstones) ----
    const pull = await clubApi.pullSync(session.token, meta.lastPulledAt);
    let pulled = 0;
    for (const row of pull.rows) {
      if (row.kind !== 'document') continue;
      if (row.deletedAt) {
        await applyRemoteDelete(row.key);
        pulled++;
      } else if (row.envelope) {
        const bundle = row.envelope.payload as SyncDocBundle;
        if (!bundle?.doc?.id) continue;
        const bytes = await clubApi.getSyncBlobBytes(session.token, bundle.fileHash);
        await applyRemoteDocBundle(bundle, new Blob([bytes], { type: bundle.fileMime || 'application/octet-stream' }));
        pulled++;
      }
    }
    await setSyncMeta({ lastPulledAt: pull.serverTime });
    return { pushed, pulled, skippedTooLarge: skipped.size };
  } finally {
    running = false;
  }
}

// Turn sync on: mark enabled, back-fill the whole library into the outbox, then
// run a cycle. On a fresh device the outbox backfill is empty (no local docs),
// so the cycle is a pure restore.
export async function enableSync(): Promise<{ pushed: number; pulled: number; skippedTooLarge: number } | null> {
  await setSyncMeta({ enabled: true });
  await enqueueAllDocsForBackfill();
  return syncNow();
}

// Turn sync off: stop mirroring and drop the outbox. Local + cloud data are
// untouched; re-enabling re-backfills and resumes.
export async function disableSync(): Promise<void> {
  await setSyncMeta({ enabled: false });
  await clearOutbox();
}
