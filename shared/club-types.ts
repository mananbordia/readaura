// Canonical contracts shared by the Vercel frontend, the Vercel `/api/club`
// proxy routes, and the Hono backend on Oracle. Pure types + a couple of
// constants — NO runtime logic and NO dependencies — so both the Next.js build
// and the separate `server/` package can import this file without coupling.
//
// Phase 1 defines the contract; the routes that fulfil it land in later slices.

/** Bump when the rendered-snapshot format changes (e.g. a mammoth/pdf.js
 *  upgrade alters the HTML byte-for-byte). Persisted on every published doc and
 *  every anchor so a library upgrade can't silently re-fragment content-hash
 *  dedupe or orphan annotations. */
export const CLUB_SNAPSHOT_FORMAT_VERSION = 1;

export type ClubFileType = 'pdf' | 'docx' | 'txt';
export type MemberRole = 'owner' | 'member' | 'reader';
export type SharedAnnotationKind = 'highlight' | 'thread';

/** W3C-style TextQuote anchor plus a fast-path block hint. Re-anchors a
 *  highlight / Aura thread to the same passage across re-render and across two
 *  users' devices. `blockTtsIndex` is null for PDFs (no `data-tts-index`). */
export type TextQuoteAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  blockTtsIndex: number | null;
  charOffsetInBlock: number;
  /** Hash of the fast-path block's normalized text; verified before trusting
   *  the `data-tts-index` jump, so we never silently anchor into a changed block. */
  blockHash: string | null;
  snapshotFormatVersion: number;
};

export type ThreadMessageDTO = {
  role: 'user' | 'assistant';
  content: string;
  sequence: number;
};

export type SharedAnnotationPayload =
  | { kind: 'thread'; messages: ThreadMessageDTO[] }
  | { kind: 'highlight'; label?: string; color?: string };

// ---- Entity DTOs (what the backend returns) -----------------------------

export type PublishedDocDTO = {
  logicalId: string;
  contentHash: string;
  title: string;
  tags: string[];
  fileType: ClubFileType;
  snapshotFormatVersion: number;
  publisherId: string;
  publisherName: string;
  publishedAt: string;
  updatedAt: string;
};

export type SharedAnnotationDTO = {
  id: string;
  logicalId: string;
  authorId: string;
  authorName: string;
  kind: SharedAnnotationKind;
  anchor: TextQuoteAnchor;
  selectedText: string;
  payload: SharedAnnotationPayload;
  /** The author's local IndexedDB id, so their own client can reconcile its
   *  copy with the server copy under last-write-wins. */
  clientId: string;
  updatedAt: string;
  deletedAt: string | null;
};

// ---- Auth: invite-code join + one-time recovery-code reclaim -------------

export type JoinRequest = { inviteCode: string; displayName: string };
export type JoinResponse = {
  token: string;
  userId: string;
  displayName: string;
  role: MemberRole;
  /** Shown to the user exactly once; re-entering it reclaims this same userId
   *  after a browser wipe. Hashed at rest server-side, rotated on use. */
  recoveryCode: string;
};
export type RecoverRequest = { recoveryCode: string };
export type RecoverResponse = JoinResponse;

// A logged-in member regenerates their recovery code (the secret is stored
// hashed, so the original can't be re-shown — this issues a fresh one and
// invalidates the old). Returns the new code, shown once.
export type RegenerateRecoveryResponse = { recoveryCode: string };

// Single-use, per-member invites. An owner mints one code per member; the code
// is consumed on join. The very first owner bootstraps from a code the server
// prints to its logs on first start.
export type CreateInviteRequest = { label?: string; role?: MemberRole };
export type CreateInviteResponse = { code: string; role: MemberRole; label: string | null };

// Owner-only Members-tab views.
export type InviteDTO = {
  id: string;
  code: string;
  role: MemberRole;
  expiresAt: string | null;
  createdAt: string;
};
export type MemberDTO = {
  userId: string;
  displayName: string;
  role: MemberRole;
  joinedAt: string;
};

// ---- Publish / discover --------------------------------------------------

export type PublishRequest = {
  contentHash: string;
  logicalId: string;
  title: string;
  tags: string[];
  fileType: ClubFileType;
  snapshotFormatVersion: number;
  /** DOCX/TXT carry their rendered snapshot HTML inline; PDFs upload bytes in a
   *  separate content-addressed step keyed by `contentHash`. */
  snapshotHtml?: string;
};

// ---- Shared annotations (Phase 3) ----------------------------------------
// A member's explanation/highlight shared with the club, anchored to a doc by
// logicalId. Upserted by (authorId, clientId) so re-pushing the same local note
// updates its server row rather than duplicating.
export type ShareAnnotationRequest = {
  logicalId: string;
  kind: SharedAnnotationKind;
  anchor: TextQuoteAnchor;
  selectedText: string;
  payload: SharedAnnotationPayload;
  /** The author's local IndexedDB id (the SavedExplanation id) — the upsert key. */
  clientId: string;
};

// ---- Personal sync (a SEPARATE lane from clubs; opt-in; default off) ------
//
// Unencrypted for now. The envelope is forward-compatible with client-side
// encryption: flip `enc` to 'aes-gcm' and store ciphertext in `payload` with
// no schema change and no data migration — the server treats `payload` as
// opaque either way.

export type SyncEnvelope = {
  formatVersion: number;
  enc: 'none' | 'aes-gcm';
  payload: unknown;
};
export type SyncKind = 'document' | 'file' | 'htmlOverride' | 'explanation';
export type SyncPushItem = {
  kind: SyncKind;
  key: string;
  action: 'put' | 'delete';
  updatedAt: string;
  /** null for deletes */
  envelope: SyncEnvelope | null;
};

// Push a batch of local changes (incl. explicit delete tombstones — deletes are
// NEVER inferred from absence, so a fresh/recovered device can't wipe the cloud).
export type SyncPushRequest = { items: SyncPushItem[] };
export type SyncPushResponse = { ok: true; serverTime: string };

// A row returned by pull. `envelope` is null for tombstones (deletedAt set).
export type SyncPullRow = {
  kind: SyncKind;
  key: string;
  updatedAt: string;
  deletedAt: string | null;
  envelope: SyncEnvelope | null;
};
// `since` filters by updatedAt; echo `serverTime` back as the next cursor.
export type SyncPullResponse = { rows: SyncPullRow[]; serverTime: string };

export type ApiError = { error: string };
