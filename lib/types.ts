import type {
  TextQuoteAnchor,
  SharedAnnotationKind,
  SharedAnnotationPayload,
} from '@/shared/club-types';

export type FileType = 'pdf' | 'docx' | 'txt';

export type Document = {
  id: string;
  title: string;
  tags: string[];
  fileType: FileType;
  fileSize: number;
  createdAt: string;
};

export type ExplanationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sequence: number;
};

export type SavedExplanation = {
  id: string;
  documentId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  createdAt: string;
  updatedAt: string;
  messages: ExplanationMessage[];
  /** Present ONLY when the user has explicitly shared this note to a club.
   *  Absent => private: it never enters the club outbox and never transits the
   *  network. This single optional field is the entire private/shared switch. */
  shared?: { serverId: string; sharedAt: string };
};

// ---- Club + personal-sync local stores (IndexedDB v2) -------------------
//
// These stores are created unconditionally at DB v2 for schema consistency,
// but are ONLY written by flag-gated club code paths or opt-in personal sync.
// When the club flag is off and sync is disabled they stay empty and inert, so
// the default offline library/CRUD behaviour is unchanged.

/** A club doc this user has discovered and/or cached locally. */
export type ClubDoc = {
  id: string;
  /** Stable across publisher edits; groups successive versions of one doc. */
  logicalId: string;
  /** Latest content hash known from the server (for "publisher edited" detection). */
  contentHash: string;
  /** The snapshot actually materialised into local IndexedDB. */
  cachedContentHash: string;
  clubId: string;
  title: string;
  tags: string[];
  fileType: FileType;
  publishedByName: string;
  publishedAt: string;
  snapshotFormatVersion: number;
  /** The `documents` store id once this snapshot is imported, else null. */
  localDocumentId: string | null;
  /** True if THIS user published it (can update); false if opened from someone
   *  else (publishing again forks to a new logicalId). */
  mine?: boolean;
};

/** Read-only local cache of shared annotations merged from the backend. */
export type SharedAnnotationCache = {
  id: string;
  logicalId: string;
  authorId: string;
  authorName: string;
  kind: SharedAnnotationKind;
  anchor: TextQuoteAnchor;
  selectedText: string;
  payload: SharedAnnotationPayload;
  clientId: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** The local-first outbox for CLUB writes (drained only by the club pusher). */
export type ClubOutboxOp = {
  id: string;
  op: 'publish' | 'unpublish' | 'shareNote' | 'unshareNote';
  entityId: string;
  payload: unknown;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
};

export type PersonalSyncKind = 'document' | 'file' | 'htmlOverride' | 'explanation';

/** The local-first outbox for PERSONAL SYNC (a separate lane; never touches the
 *  club path). Drained only by the personal-sync pusher when sync is enabled. */
export type PersonalSyncOp = {
  id: string;
  kind: PersonalSyncKind;
  key: string;
  action: 'put' | 'delete';
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

/** Singleton (`id: 'state'`) holding personal-sync enablement + cursors. */
export type PersonalSyncMeta = {
  id: string;
  enabled: boolean;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
};
