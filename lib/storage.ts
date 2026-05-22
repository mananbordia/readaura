'use client';

// IndexedDB persistence layer. Everything the library shows lives here:
// metadata, file blobs, edited-DOCX HTML overrides, and saved explanation
// threads. Replaces the previous SQLite-on-the-server model so the app can
// run statelessly on Vercel / any edge host.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Document, ExplanationMessage, FileType, SavedExplanation } from './types';

interface ReadAuraDB extends DBSchema {
  documents: { key: string; value: Document };
  files: { key: string; value: { id: string; blob: Blob } };
  htmlOverrides: { key: string; value: { id: string; html: string } };
  explanations: {
    key: string;
    value: SavedExplanation;
    indexes: { 'by-document': string };
  };
}

const DB_NAME = 'readaura';
const DB_VERSION = 1;

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
    id: crypto.randomUUID(),
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
}

// ---- Files (blobs) ------------------------------------------------------

export async function getFile(id: string): Promise<Blob | null> {
  const row = await (await db()).get('files', id);
  return row?.blob ?? null;
}

export async function setFileText(id: string, text: string): Promise<void> {
  const d = await db();
  const blob = new Blob([text], { type: 'text/plain' });
  const tx = d.transaction(['documents', 'files'], 'readwrite');
  const existing = await tx.objectStore('documents').get(id);
  if (existing) {
    await tx.objectStore('documents').put({ ...existing, fileSize: blob.size });
  }
  await tx.objectStore('files').put({ id, blob });
  await tx.done;
}

// ---- HTML overrides (edited DOCX) --------------------------------------

export async function getHtmlOverride(id: string): Promise<string | null> {
  const row = await (await db()).get('htmlOverrides', id);
  return row?.html ?? null;
}

export async function setHtmlOverride(id: string, html: string): Promise<void> {
  await (await db()).put('htmlOverrides', { id, html });
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
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<SavedExplanation> {
  const now = new Date().toISOString();
  const exp: SavedExplanation = {
    id: crypto.randomUUID(),
    documentId: args.documentId,
    selectedText: args.selectedText,
    contextBefore: args.contextBefore,
    contextAfter: args.contextAfter,
    createdAt: now,
    updatedAt: now,
    messages: args.messages.map((m, i) => ({
      id: crypto.randomUUID(),
      role: m.role,
      content: m.content,
      createdAt: now,
      sequence: i,
    })),
  };
  await (await db()).put('explanations', exp);
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
    id: crypto.randomUUID(),
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
  return next;
}

export async function deleteExplanation(id: string): Promise<void> {
  await (await db()).delete('explanations', id);
}
