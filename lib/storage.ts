'use client';

// IndexedDB persistence layer. Everything the library shows lives here:
// metadata, file blobs, edited-DOCX HTML overrides, and saved explanation
// threads. Replaces the previous SQLite-on-the-server model so the app can
// run statelessly on Vercel / any edge host.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  ClubDoc,
  ClubOutboxOp,
  Document,
  ExplanationMessage,
  FileType,
  PersonalSyncMeta,
  PersonalSyncOp,
  SavedExplanation,
  SharedAnnotationCache,
  SyncDocBundle,
} from './types';

function getRandomUUID(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    if (typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    if (typeof window.crypto.getRandomValues === 'function') {
      return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
        (c ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      );
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface ReadAuraDB extends DBSchema {
  documents: { key: string; value: Document };
  files: { key: string; value: { id: string; blob: Blob } };
  htmlOverrides: { key: string; value: { id: string; html: string } };
  explanations: {
    key: string;
    value: SavedExplanation;
    indexes: { 'by-document': string };
  };
  // --- v2: club + personal-sync stores (created unconditionally for schema
  // consistency; written only by flag-gated club code / opt-in personal sync) ---
  clubDocs: {
    key: string;
    value: ClubDoc;
    indexes: { 'by-logicalId': string; 'by-localDocumentId': string };
  };
  sharedAnnotations: {
    key: string;
    value: SharedAnnotationCache;
    indexes: { 'by-logicalId': string };
  };
  clubOutbox: {
    key: string;
    value: ClubOutboxOp;
    indexes: { 'by-createdAt': string };
  };
  personalSyncQueue: {
    key: string;
    value: PersonalSyncOp;
    indexes: { 'by-createdAt': string };
  };
  personalSyncMeta: { key: string; value: PersonalSyncMeta };
}

const DB_NAME = 'readaura';
// v2 adds the (empty, inert) club + personal-sync stores. The upgrade is
// purely additive and guarded by `!contains()`, so an existing v1 database
// migrates by creating the new stores only — the four original stores and all
// existing rows are never touched.
const DB_VERSION = 2;

let _dbPromise: Promise<IDBPDatabase<ReadAuraDB>> | null = null;

function db(): Promise<IDBPDatabase<ReadAuraDB>> {
  if (typeof window === 'undefined') {
    throw new Error('lib/storage.ts must only be used in the browser');
  }
  if (!_dbPromise) {
    _dbPromise = openDB<ReadAuraDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('documents')) {
          d.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('files')) {
          d.createObjectStore('files', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('htmlOverrides')) {
          d.createObjectStore('htmlOverrides', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('explanations')) {
          const store = d.createObjectStore('explanations', { keyPath: 'id' });
          store.createIndex('by-document', 'documentId');
        }
        // v2 additive stores. Guarded individually so this branch is safe to
        // run from any prior version (fresh install or an existing v1 DB).
        if (!d.objectStoreNames.contains('clubDocs')) {
          const s = d.createObjectStore('clubDocs', { keyPath: 'id' });
          s.createIndex('by-logicalId', 'logicalId');
          s.createIndex('by-localDocumentId', 'localDocumentId');
        }
        if (!d.objectStoreNames.contains('sharedAnnotations')) {
          const s = d.createObjectStore('sharedAnnotations', { keyPath: 'id' });
          s.createIndex('by-logicalId', 'logicalId');
        }
        if (!d.objectStoreNames.contains('clubOutbox')) {
          const s = d.createObjectStore('clubOutbox', { keyPath: 'id' });
          s.createIndex('by-createdAt', 'createdAt');
        }
        if (!d.objectStoreNames.contains('personalSyncQueue')) {
          const s = d.createObjectStore('personalSyncQueue', { keyPath: 'id' });
          s.createIndex('by-createdAt', 'createdAt');
        }
        if (!d.objectStoreNames.contains('personalSyncMeta')) {
          d.createObjectStore('personalSyncMeta', { keyPath: 'id' });
        }
      },
    });
  }
  return _dbPromise;
}

// ---- Documents ----------------------------------------------------------

export async function listDocuments(): Promise<Document[]> {
  const all = await (await db()).getAll('documents');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDocument(id: string): Promise<Document | null> {
  return (await (await db()).get('documents', id)) ?? null;
}

export async function createDocument(args: {
  blob: Blob;
  title: string;
  tags: string[];
  fileType: FileType;
}): Promise<Document> {
  const d = await db();
  const doc: Document = {
    id: getRandomUUID(),
    title: args.title,
    tags: args.tags,
    fileType: args.fileType,
    fileSize: args.blob.size,
    createdAt: new Date().toISOString(),
  };
  const tx = d.transaction(['documents', 'files'], 'readwrite');
  await tx.objectStore('documents').put(doc);
  await tx.objectStore('files').put({ id: doc.id, blob: args.blob });
  await tx.done;
  await enqueueSync(doc.id, 'put');
  return doc;
}

export async function updateDocument(
  id: string,
  patch: { title: string; tags: string[] },
): Promise<void> {
  const d = await db();
  const existing = await d.get('documents', id);
  if (!existing) return;
  await d.put('documents', { ...existing, title: patch.title, tags: patch.tags });
  await enqueueSync(id, 'put');
}

export async function deleteDocument(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(
    ['documents', 'files', 'htmlOverrides', 'explanations'],
    'readwrite',
  );
  await tx.objectStore('documents').delete(id);
  await tx.objectStore('files').delete(id);
  await tx.objectStore('htmlOverrides').delete(id);
  let cursor = await tx.objectStore('explanations').index('by-document').openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
  await enqueueSync(id, 'delete'); // explicit tombstone — never inferred from absence
}

// ---- Files (blobs) ------------------------------------------------------

export async function getFile(id: string): Promise<Blob | null> {
  const row = await (await db()).get('files', id);
  return row?.blob ?? null;
}

// Replace a document's stored blob in place (used to sync a club doc to a newer
// published revision without creating a duplicate library entry).
export async function replaceFile(id: string, blob: Blob): Promise<void> {
  await (await db()).put('files', { id, blob });
  await enqueueSync(id, 'put');
}

// ---- HTML overrides (edited DOCX / TXT) --------------------------------

export async function getHtmlOverride(id: string): Promise<string | null> {
  const row = await (await db()).get('htmlOverrides', id);
  // Treat an empty override as absent so the original blob is re-read (and a
  // doc whose edit collapsed to nothing can recover on reload).
  return row?.html || null;
}

export async function setHtmlOverride(id: string, html: string): Promise<void> {
  await (await db()).put('htmlOverrides', { id, html });
  await enqueueSync(id, 'put');
}

// ---- Explanations -------------------------------------------------------

export async function listExplanations(documentId: string): Promise<SavedExplanation[]> {
  const all = await (await db()).getAllFromIndex('explanations', 'by-document', documentId);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createExplanation(args: {
  documentId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  blockIndex?: number | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<SavedExplanation> {
  const now = new Date().toISOString();
  const exp: SavedExplanation = {
    id: getRandomUUID(),
    documentId: args.documentId,
    selectedText: args.selectedText,
    contextBefore: args.contextBefore,
    contextAfter: args.contextAfter,
    blockIndex: args.blockIndex ?? null,
    createdAt: now,
    updatedAt: now,
    messages: args.messages.map((m, i) => ({
      id: getRandomUUID(),
      role: m.role,
      content: m.content,
      createdAt: now,
      sequence: i,
    })),
  };
  await (await db()).put('explanations', exp);
  await enqueueSync(args.documentId, 'put');
  return exp;
}

export async function appendExplanationMessages(
  explanationId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<SavedExplanation | null> {
  const d = await db();
  const existing = await d.get('explanations', explanationId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const startSeq = existing.messages.length > 0
    ? existing.messages[existing.messages.length - 1].sequence + 1
    : 0;
  const appended: ExplanationMessage[] = messages.map((m, i) => ({
    id: getRandomUUID(),
    role: m.role,
    content: m.content,
    createdAt: now,
    sequence: startSeq + i,
  }));
  const next: SavedExplanation = {
    ...existing,
    updatedAt: now,
    messages: [...existing.messages, ...appended],
  };
  await d.put('explanations', next);
  await enqueueSync(existing.documentId, 'put');
  return next;
}

export async function deleteExplanation(id: string): Promise<void> {
  const d = await db();
  const exp = await d.get('explanations', id);
  await d.delete('explanations', id);
  // Re-sync the parent doc's bundle (minus this note) rather than a doc delete.
  if (exp) await enqueueSync(exp.documentId, 'put');
}

// ---- Club docs (local link between a library doc and a published doc) ----

export async function listClubDocs(): Promise<ClubDoc[]> {
  return (await db()).getAll('clubDocs');
}

export async function getClubDocByLogicalId(logicalId: string): Promise<ClubDoc | null> {
  return (await (await db()).getFromIndex('clubDocs', 'by-logicalId', logicalId)) ?? null;
}

export async function getClubDocByLocalId(localDocumentId: string): Promise<ClubDoc | null> {
  return (await (await db()).getFromIndex('clubDocs', 'by-localDocumentId', localDocumentId)) ?? null;
}

export async function putClubDoc(row: ClubDoc): Promise<void> {
  await (await db()).put('clubDocs', row);
}

export async function deleteClubDoc(id: string): Promise<void> {
  await (await db()).delete('clubDocs', id);
}

// ---- Personal sync (opt-in, account-level library mirror) ----------------
// Local mutations enqueue an outbox op IFF sync is enabled; the club-gated sync
// engine drains the queue. Deletes enqueue an EXPLICIT tombstone (never inferred
// from absence), so a fresh/recovered device — with an empty queue — can only
// restore, never wipe the cloud. Cached copies of OTHERS' club docs are excluded
// (hidden from the library, re-fetchable from the club).

const SYNC_META_KEY = 'state';
const DEFAULT_SYNC_META: PersonalSyncMeta = { id: SYNC_META_KEY, enabled: false, lastPushedAt: null, lastPulledAt: null };

export async function getSyncMeta(): Promise<PersonalSyncMeta> {
  return (await (await db()).get('personalSyncMeta', SYNC_META_KEY)) ?? DEFAULT_SYNC_META;
}

export async function setSyncMeta(patch: Partial<Omit<PersonalSyncMeta, 'id'>>): Promise<PersonalSyncMeta> {
  const d = await db();
  const cur = (await d.get('personalSyncMeta', SYNC_META_KEY)) ?? DEFAULT_SYNC_META;
  const next: PersonalSyncMeta = { ...cur, ...patch, id: SYNC_META_KEY };
  await d.put('personalSyncMeta', next);
  return next;
}

// Is this local doc a cached copy of someone else's club doc (mine !== true)?
// Those are excluded from personal sync.
async function isForeignClubCache(d: IDBPDatabase<ReadAuraDB>, docId: string): Promise<boolean> {
  const link = await d.getFromIndex('clubDocs', 'by-localDocumentId', docId);
  return !!link && link.mine !== true;
}

async function enqueueSync(key: string, action: 'put' | 'delete'): Promise<void> {
  const d = await db();
  const meta = await d.get('personalSyncMeta', SYNC_META_KEY);
  if (!meta?.enabled) return;
  if (await isForeignClubCache(d, key)) return;
  await d.put('personalSyncQueue', {
    id: getRandomUUID(),
    kind: 'document',
    key,
    action,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  });
}

export async function listOutbox(): Promise<PersonalSyncOp[]> {
  return (await db()).getAll('personalSyncQueue');
}

export async function clearOutboxOps(ids: string[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('personalSyncQueue', 'readwrite');
  for (const id of ids) await tx.objectStore('personalSyncQueue').delete(id);
  await tx.done;
}

export async function clearOutbox(): Promise<void> {
  await (await db()).clear('personalSyncQueue');
}

// On enable: enqueue a put for every OWN local document so the whole library
// backs up (foreign club caches excluded).
export async function enqueueAllDocsForBackfill(): Promise<void> {
  const d = await db();
  const docs = await d.getAll('documents');
  const foreign = new Set(
    (await d.getAll('clubDocs')).filter((l) => l.mine !== true && l.localDocumentId).map((l) => l.localDocumentId as string),
  );
  const tx = d.transaction('personalSyncQueue', 'readwrite');
  for (const doc of docs) {
    if (foreign.has(doc.id)) continue;
    await tx.objectStore('personalSyncQueue').put({
      id: getRandomUUID(), kind: 'document' as const, key: doc.id, action: 'put' as const,
      createdAt: new Date().toISOString(), attempts: 0, lastError: null,
    });
  }
  await tx.done;
}

// ---- Pull-apply (writes pulled from the cloud; must NOT re-enqueue) -------

export async function applyRemoteDocBundle(bundle: SyncDocBundle, blob: Blob): Promise<void> {
  const d = await db();
  const tx = d.transaction(['documents', 'files', 'htmlOverrides', 'explanations'], 'readwrite');
  await tx.objectStore('documents').put(bundle.doc);
  await tx.objectStore('files').put({ id: bundle.doc.id, blob });
  if (bundle.htmlOverride) await tx.objectStore('htmlOverrides').put({ id: bundle.doc.id, html: bundle.htmlOverride });
  else await tx.objectStore('htmlOverrides').delete(bundle.doc.id);
  const expStore = tx.objectStore('explanations');
  let cur = await expStore.index('by-document').openCursor(bundle.doc.id);
  while (cur) { await cur.delete(); cur = await cur.continue(); }
  for (const e of bundle.explanations) await expStore.put(e);
  await tx.done;
}

export async function applyRemoteDelete(docId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['documents', 'files', 'htmlOverrides', 'explanations'], 'readwrite');
  await tx.objectStore('documents').delete(docId);
  await tx.objectStore('files').delete(docId);
  await tx.objectStore('htmlOverrides').delete(docId);
  let cur = await tx.objectStore('explanations').index('by-document').openCursor(docId);
  while (cur) { await cur.delete(); cur = await cur.continue(); }
  await tx.done;
}
