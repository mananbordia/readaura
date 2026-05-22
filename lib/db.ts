import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { LOCAL_USER_ID, LOCAL_USERNAME } from './auth';

// ---- Types ----

export type Document = {
  id: string;
  userId: string;
  username: string;
  title: string;
  tags: string[];
  fileType: string;
  filePath: string;
  fileSize: number;
  textCache: string | null;
  createdAt: string;
};

export type ExplanationMessage = {
  id: string;
  explanationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sequence: number;
};

export type SavedExplanation = {
  id: string;
  userId: string;
  documentId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  createdAt: string;
  updatedAt: string;
  messages: ExplanationMessage[];
};

// ---- DB init ----

const DB_PATH = process.env.READAURA_DB_PATH ?? path.join(process.cwd(), 'readaura.db');

let _db: Database.Database | null = null;
const _stmtCache = new Map<string, Database.Statement>();

function runDDL(d: Database.Database, sql: string) {
  const fn = d.exec.bind(d);
  fn(sql);
}

function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  migrateLegacy(_db);
  seedLocalUser(_db);
  return _db;
}

function stmt(sql: string): Database.Statement {
  let s = _stmtCache.get(sql);
  if (!s) {
    s = db().prepare(sql);
    _stmtCache.set(sql, s);
  }
  return s;
}

function initSchema(d: Database.Database) {
  runDDL(d, `
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      title       TEXT NOT NULL,
      tags        TEXT NOT NULL DEFAULT '[]',
      file_type   TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      file_size   INTEGER NOT NULL,
      text_cache  TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_explanations (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id),
      document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      selected_text   TEXT NOT NULL,
      context_before  TEXT NOT NULL DEFAULT '',
      context_after   TEXT NOT NULL DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS explanation_messages (
      id              TEXT PRIMARY KEY,
      explanation_id  TEXT NOT NULL REFERENCES saved_explanations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      sequence        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_explanations_document ON saved_explanations(document_id);
    CREATE INDEX IF NOT EXISTS idx_explanations_user ON saved_explanations(user_id);
    CREATE INDEX IF NOT EXISTS idx_explanation_messages_thread ON explanation_messages(explanation_id, sequence);
  `);
}

// Migrate from the pre-OSS schema (research_reports + region) to the new
// documents schema. Idempotent — no-op if the legacy table is absent.
// Region values are preserved as lowercase tags so users don't lose grouping.
function migrateLegacy(d: Database.Database) {
  const legacy = d
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='research_reports'`)
    .get();
  if (!legacy) return;

  d.transaction(() => {
    type LegacyRow = {
      id: string; user_id: string; region: string | null; title: string;
      tags: string; file_type: string; file_path: string; file_size: number;
      text_cache: string | null; created_at: string;
    };
    const rows = d.prepare(`SELECT * FROM research_reports`).all() as LegacyRow[];
    const insertDoc = d.prepare(`INSERT OR IGNORE INTO documents
      (id, user_id, title, tags, file_type, file_path, file_size, text_cache, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const r of rows) {
      let tags: string[] = [];
      try { tags = JSON.parse(r.tags); } catch { tags = []; }
      if (r.region && r.region.trim()) {
        const regionTag = r.region.trim().toLowerCase();
        if (!tags.includes(regionTag)) tags.push(regionTag);
      }
      insertDoc.run(
        r.id, r.user_id, r.title, JSON.stringify(tags),
        r.file_type, r.file_path, r.file_size, r.text_cache, r.created_at,
      );
    }

    // Rebuild saved_explanations if it still uses the old report_id column.
    const hasReportIdCol = d
      .prepare(`SELECT 1 AS x FROM pragma_table_info('saved_explanations') WHERE name='report_id'`)
      .get();
    if (hasReportIdCol) {
      d.exec(`
        CREATE TABLE saved_explanations_new (
          id              TEXT PRIMARY KEY,
          user_id         TEXT NOT NULL REFERENCES users(id),
          document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          selected_text   TEXT NOT NULL,
          context_before  TEXT NOT NULL DEFAULT '',
          context_after   TEXT NOT NULL DEFAULT '',
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
        INSERT INTO saved_explanations_new
          (id, user_id, document_id, selected_text, context_before, context_after, created_at, updated_at)
        SELECT id, user_id, report_id, selected_text, context_before, context_after, created_at, updated_at
        FROM saved_explanations;
        DROP TABLE saved_explanations;
        ALTER TABLE saved_explanations_new RENAME TO saved_explanations;
        CREATE INDEX IF NOT EXISTS idx_explanations_document ON saved_explanations(document_id);
        CREATE INDEX IF NOT EXISTS idx_explanations_user ON saved_explanations(user_id);
      `);
    }

    d.exec(`DROP TABLE research_reports`);
  })();
}

function seedLocalUser(d: Database.Database) {
  d.prepare('INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)')
    .run(LOCAL_USER_ID, LOCAL_USERNAME, new Date().toISOString());
}

// ---- Document queries ----

type DocumentRow = {
  id: string;
  user_id: string;
  username: string;
  title: string;
  tags: string;
  file_type: string;
  file_path: string;
  file_size: number;
  text_cache: string | null;
  created_at: string;
};

function toDocument(r: DocumentRow): Document {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    title: r.title,
    tags: JSON.parse(r.tags) as string[],
    fileType: r.file_type,
    filePath: r.file_path,
    fileSize: r.file_size,
    textCache: r.text_cache,
    createdAt: r.created_at,
  };
}

export function createDocument(doc: {
  id: string;
  userId: string;
  title: string;
  tags: string[];
  fileType: string;
  filePath: string;
  fileSize: number;
}): void {
  stmt(`INSERT INTO documents (id, user_id, title, tags, file_type, file_path, file_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(doc.id, doc.userId, doc.title,
      JSON.stringify(doc.tags), doc.fileType, doc.filePath, doc.fileSize,
      new Date().toISOString());
}

export function listDocuments(userId: string): Document[] {
  const rows = stmt(`SELECT d.*, u.username FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.user_id = ? ORDER BY d.created_at DESC`)
    .all(userId) as DocumentRow[];
  return rows.map(toDocument);
}

export function getDocumentById(id: string): Document | null {
  const row = stmt(`SELECT d.*, u.username FROM documents d
    JOIN users u ON u.id = d.user_id
    WHERE d.id = ?`)
    .get(id) as DocumentRow | undefined;
  return row ? toDocument(row) : null;
}

export function deleteDocument(id: string, userId: string): boolean {
  const result = stmt('DELETE FROM documents WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}

export function updateDocument(id: string, userId: string, title: string, tags: string[]): boolean {
  const result = stmt('UPDATE documents SET title = ?, tags = ? WHERE id = ? AND user_id = ?')
    .run(title, JSON.stringify(tags), id, userId);
  return result.changes > 0;
}

export function updateDocumentTextCache(id: string, text: string): void {
  stmt('UPDATE documents SET text_cache = ? WHERE id = ?')
    .run(text, id);
}

// ---- Saved explanations queries ----

type ExplanationRow = {
  id: string;
  user_id: string;
  document_id: string;
  selected_text: string;
  context_before: string;
  context_after: string;
  created_at: string;
  updated_at: string;
};

type ExplanationMessageRow = {
  id: string;
  explanation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  sequence: number;
};

function toExplanationMessage(row: ExplanationMessageRow): ExplanationMessage {
  return {
    id: row.id,
    explanationId: row.explanation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    sequence: row.sequence,
  };
}

function toExplanation(row: ExplanationRow, messages: ExplanationMessage[]): SavedExplanation {
  return {
    id: row.id,
    userId: row.user_id,
    documentId: row.document_id,
    selectedText: row.selected_text,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

export function createExplanation(args: {
  id: string;
  userId: string;
  documentId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: string;
}): void {
  const insertParent = stmt(`INSERT INTO saved_explanations
    (id, user_id, document_id, selected_text, context_before, context_after, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertMsg = stmt(`INSERT INTO explanation_messages
    (id, explanation_id, role, content, created_at, sequence)
    VALUES (?, ?, ?, ?, ?, ?)`);

  db().transaction(() => {
    insertParent.run(
      args.id, args.userId, args.documentId,
      args.selectedText, args.contextBefore, args.contextAfter,
      args.createdAt, args.createdAt,
    );
    args.messages.forEach((m, i) => {
      insertMsg.run(
        crypto.randomUUID(), args.id, m.role, m.content, args.createdAt, i,
      );
    });
  })();
}

export function appendExplanationMessages(
  explanationId: string,
  userId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): boolean {
  const owner = stmt('SELECT user_id FROM saved_explanations WHERE id = ?')
    .get(explanationId) as { user_id: string } | undefined;
  if (!owner || owner.user_id !== userId) return false;

  const maxSeqRow = stmt('SELECT COALESCE(MAX(sequence), -1) AS max_seq FROM explanation_messages WHERE explanation_id = ?')
    .get(explanationId) as { max_seq: number };
  let nextSeq = maxSeqRow.max_seq + 1;

  const insertMsg = stmt(`INSERT INTO explanation_messages
    (id, explanation_id, role, content, created_at, sequence)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const updateParent = stmt('UPDATE saved_explanations SET updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();

  db().transaction(() => {
    for (const m of messages) {
      insertMsg.run(crypto.randomUUID(), explanationId, m.role, m.content, now, nextSeq++);
    }
    updateParent.run(now, explanationId);
  })();
  return true;
}

export function getExplanationById(explanationId: string, userId: string): SavedExplanation | null {
  const row = stmt('SELECT * FROM saved_explanations WHERE id = ? AND user_id = ?')
    .get(explanationId, userId) as ExplanationRow | undefined;
  if (!row) return null;

  const messageRows = stmt('SELECT * FROM explanation_messages WHERE explanation_id = ? ORDER BY sequence ASC')
    .all(explanationId) as ExplanationMessageRow[];
  return toExplanation(row, messageRows.map(toExplanationMessage));
}

export function getExplanationsByDocument(documentId: string, userId: string): SavedExplanation[] {
  const rows = stmt('SELECT * FROM saved_explanations WHERE document_id = ? AND user_id = ? ORDER BY updated_at DESC')
    .all(documentId, userId) as ExplanationRow[];
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => '?').join(',');
  const allMessages = stmt(`SELECT * FROM explanation_messages WHERE explanation_id IN (${placeholders}) ORDER BY sequence ASC`)
    .all(...rows.map(r => r.id)) as ExplanationMessageRow[];

  const grouped = new Map<string, ExplanationMessage[]>();
  for (const m of allMessages) {
    let arr = grouped.get(m.explanation_id);
    if (!arr) { arr = []; grouped.set(m.explanation_id, arr); }
    arr.push(toExplanationMessage(m));
  }
  return rows.map(r => toExplanation(r, grouped.get(r.id) ?? []));
}

export function deleteExplanation(id: string, userId: string): boolean {
  const result = stmt('DELETE FROM saved_explanations WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}
