// High-level shared-explanation helpers (Phase 3). Imported ONLY via a
// CLUB_BUILD-gated dynamic import() from the reader, so its club dependencies
// land in a lazy chunk and are dead-code-eliminated from the flag-off build.

import { clubApi } from './api';
import { readClubSession } from '@/lib/use-club';
import { getClubDocByLocalId } from '@/lib/storage';
import { CLUB_SNAPSHOT_FORMAT_VERSION, type SharedAnnotationDTO } from '@/shared/club-types';
import type { SavedExplanation } from '@/lib/types';

// The reader-facing view of a shared explanation (no club types leak upward).
export type SharedExp = {
  id: string;
  clientId: string;
  authorId: string;
  authorName: string;
  selectedText: string;
  blockIndex: number | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
};

function toView(d: SharedAnnotationDTO): SharedExp {
  return {
    id: d.id,
    clientId: d.clientId,
    authorId: d.authorId,
    authorName: d.authorName,
    selectedText: d.selectedText,
    blockIndex: d.anchor?.blockTtsIndex ?? null,
    messages: d.payload.kind === 'thread'
      ? d.payload.messages.map((m) => ({ role: m.role, content: m.content }))
      : [],
  };
}

// The club logicalId for a local doc, or null if it isn't a club doc.
async function logicalIdFor(localDocId: string): Promise<string | null> {
  const link = await getClubDocByLocalId(localDocId);
  return link?.logicalId ?? null;
}

// Whether the signed-in user is the author of a shared explanation (own ones
// are editable/removable; others' are read-only).
export function myUserId(): string | null {
  return readClubSession()?.userId ?? null;
}

// Pull every shared explanation for a club doc (empty for non-club docs).
export async function pullShared(localDocId: string): Promise<SharedExp[]> {
  const session = readClubSession();
  if (!session) return [];
  const logicalId = await logicalIdFor(localDocId);
  if (!logicalId) return [];
  const dtos = await clubApi.listAnnotations(session.token, logicalId);
  return dtos.map(toView);
}

// Auto-share (upsert) an explanation saved on a club doc. No-op for non-club
// docs or when signed out.
export async function pushShared(localDocId: string, exp: SavedExplanation): Promise<void> {
  const session = readClubSession();
  if (!session) return;
  const logicalId = await logicalIdFor(localDocId);
  if (!logicalId) return;
  await clubApi.shareAnnotation(session.token, {
    logicalId,
    kind: 'thread',
    selectedText: exp.selectedText,
    clientId: exp.id,
    anchor: {
      exact: exp.selectedText,
      prefix: exp.contextBefore.slice(-64),
      suffix: exp.contextAfter.slice(0, 64),
      blockTtsIndex: exp.blockIndex ?? null,
      charOffsetInBlock: 0,
      blockHash: null,
      snapshotFormatVersion: CLUB_SNAPSHOT_FORMAT_VERSION,
    },
    payload: {
      kind: 'thread',
      messages: exp.messages.map((m, i) => ({ role: m.role, content: m.content, sequence: m.sequence ?? i })),
    },
  });
}

// Unshare an explanation the user deleted locally (author-only on the server).
export async function removeShared(clientId: string): Promise<void> {
  const session = readClubSession();
  if (!session) return;
  await clubApi.deleteAnnotation(session.token, clientId).catch(() => {});
}
