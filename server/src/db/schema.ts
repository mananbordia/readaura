import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import type {
  TextQuoteAnchor,
  SharedAnnotationPayload,
  SyncEnvelope,
} from '../../../shared/club-types';

// The backend stores ONLY non-private rows: members, published docs, the
// annotations a user explicitly shared, and (separately) opt-in personal-sync
// blobs. A user's private library + private notes never get a row here.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  // Public locator + argon2(secret). Re-entering the recovery code reclaims
  // this same userId; both parts rotate on each successful recovery.
  recoveryLocator: text('recovery_locator').notNull().unique(),
  recoveryHash: text('recovery_hash').notNull(),
  recoveryRotatedAt: timestamp('recovery_rotated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const clubs = pgTable('clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique('memberships_user_club').on(t.userId, t.clubId)],
);

// Single-use, per-member invite codes: a short 6-char code, stored as its
// SHA-256 (fast, indexed lookup; the code is low-value + single-use, so a
// password hash + brute-force throttle on join is the right tradeoff). An owner
// mints one per member; consuming it on join sets usedAt/usedByUserId.
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull().unique(),
  // Plaintext code, retained ONLY while the invite is active so the owner can
  // see/re-share pending invites; cleared (NULL) when consumed on join, so a DB
  // leak never exposes a used code. Lookup on join still goes via codeHash.
  code: text('code'),
  role: text('role').notNull().default('member'),
  label: text('label'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // Null = never expires (used for the operator-controlled bootstrap invite).
  // Member invites get a short TTL so the 30-bit code space can't be walked.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedByUserId: uuid('used_by_user_id').references(() => users.id, { onDelete: 'set null' }),
});

export const publishedDocs = pgTable(
  'published_docs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
    // Stable across publisher edits; groups successive versions of one doc.
    logicalId: uuid('logical_id').notNull(),
    contentHash: text('content_hash').notNull(),
    title: text('title').notNull(),
    tags: text('tags').array().notNull().default([]),
    fileType: text('file_type').notNull(),
    snapshotFormatVersion: integer('snapshot_format_version').notNull(),
    // For DOCX/TXT the rendered HTML is stored as a blob; for PDFs the raw bytes.
    blobKey: text('blob_key'),
    publisherId: uuid('publisher_id').notNull().references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Tombstone: unpublish sets it (reversible by clearing it). Blob retained.
    unpublishedAt: timestamp('unpublished_at', { withTimezone: true }),
  },
  (t) => [unique('published_docs_club_hash').on(t.clubId, t.contentHash)],
);

export const docVersions = pgTable('doc_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  logicalId: uuid('logical_id').notNull(),
  contentHash: text('content_hash').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  publisherId: uuid('publisher_id').notNull().references(() => users.id),
});

export const sharedAnnotations = pgTable(
  'shared_annotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
    logicalId: uuid('logical_id').notNull(),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    anchor: jsonb('anchor').$type<TextQuoteAnchor>().notNull(),
    selectedText: text('selected_text').notNull(),
    payload: jsonb('payload').$type<SharedAnnotationPayload>().notNull(),
    // The author's local IndexedDB id, for their own last-write-wins reconcile.
    clientId: text('client_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Tombstone: unshare sets it (reversible). The author's private copy is untouched.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [unique('shared_annotations_author_client').on(t.authorId, t.clientId)],
);

// Personal sync is a SEPARATE lane from clubs: opt-in, default off, and never
// reachable from the club path. Unencrypted for now; `enc` flips to 'aes-gcm'
// with ciphertext in `payload` later, with no schema change.
export const personalSync = pgTable(
  'personal_sync',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    formatVersion: integer('format_version').notNull(),
    enc: text('enc').notNull().default('none'),
    payload: jsonb('payload').$type<SyncEnvelope>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [unique('personal_sync_user_kind_key').on(t.userId, t.kind, t.key)],
);
