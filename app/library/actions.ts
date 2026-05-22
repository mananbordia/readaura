'use server';

import { getSessionUserId } from '@/lib/auth';
import {
  listDocuments,
  deleteDocument as dbDeleteDocument,
  getDocumentById,
  updateDocument as dbUpdateDocument,
  type Document,
} from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function fetchDocuments(): Promise<Document[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  return listDocuments(userId);
}

export async function removeDocument(documentId: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };

  const doc = getDocumentById(documentId);
  if (!doc || doc.userId !== userId) return { ok: false };

  const absPath = path.join(process.cwd(), doc.filePath);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }

  dbDeleteDocument(documentId, userId);
  return { ok: true };
}

export async function editDocument(documentId: string, title: string, tags: string[]): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const doc = getDocumentById(documentId);
  if (!doc || doc.userId !== userId) return { ok: false };
  dbUpdateDocument(documentId, userId, title.trim(), tags);
  return { ok: true };
}
