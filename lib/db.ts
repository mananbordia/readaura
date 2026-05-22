import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { LOCAL_USER_ID, LOCAL_USERNAME } from './auth';

// ---- Types ----

export type ResearchReport = {
  id: string;
  userId: string;
  username: string;
  region: string;
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
  reportId: string;
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

    CREATE TABLE IF NOT EXISTS research_reports (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      region      TEXT NOT NULL,
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
      report_id       TEXT NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
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

    CREATE INDEX IF NOT EXISTS idx_reports_region ON research_reports(region);
    CREATE INDEX IF NOT EXISTS idx_explanations_report ON saved_explanations(report_id);
    CREATE INDEX IF NOT EXISTS idx_explanations_user ON saved_explanations(user_id);
    CREATE INDEX IF NOT EXISTS idx_explanation_messages_thread ON explanation_messages(explanation_id, sequence);
  `);
}

function seedLocalUser(d: Database.Database) {
  d.prepare('INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)')
    .run(LOCAL_USER_ID, LOCAL_USERNAME, new Date().toISOString());
}

// ---- Research report queries ----

type ReportRow = {
  id: string;
  user_id: string;
  username: string;
  region: string;
  title: string;
  tags: string;
  file_type: string;
  file_path: string;
  file_size: number;
  text_cache: string | null;
  created_at: string;
};

function toReport(r: ReportRow): ResearchReport {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    region: r.region,
    title: r.title,
    tags: JSON.parse(r.tags) as string[],
    fileType: r.file_type,
    filePath: r.file_path,
    fileSize: r.file_size,
    textCache: r.text_cache,
    createdAt: r.created_at,
  };
}

export function createReport(report: {
  id: string;
  userId: string;
  region: string;
  title: string;
  tags: string[];
  fileType: string;
  filePath: string;
  fileSize: number;
}): void {
  stmt(`INSERT INTO research_reports (id, user_id, region, title, tags, file_type, file_path, file_size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(report.id, report.userId, report.region, report.title,
      JSON.stringify(report.tags), report.fileType, report.filePath, report.fileSize,
      new Date().toISOString());
}

export function getReportsByRegion(region: string): ResearchReport[] {
  const rows = stmt(`SELECT r.*, u.username FROM research_reports r
    JOIN users u ON u.id = r.user_id
    WHERE r.region = ? ORDER BY r.created_at DESC`)
    .all(region) as ReportRow[];
  return rows.map(toReport);
}

export function getReportById(id: string): ResearchReport | null {
  const row = stmt(`SELECT r.*, u.username FROM research_reports r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ?`)
    .get(id) as ReportRow | undefined;
  return row ? toReport(row) : null;
}

export function deleteReport(id: string, userId: string): boolean {
  const result = stmt('DELETE FROM research_reports WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}

export function updateReport(id: string, userId: string, title: string, tags: string[]): boolean {
  const result = stmt('UPDATE research_reports SET title = ?, tags = ? WHERE id = ? AND user_id = ?')
    .run(title, JSON.stringify(tags), id, userId);
  return result.changes > 0;
}

export function updateReportTextCache(id: string, text: string): void {
  stmt('UPDATE research_reports SET text_cache = ? WHERE id = ?')
    .run(text, id);
}

// ---- Saved explanations queries ----

type ExplanationRow = {
  id: string;
  user_id: string;
  report_id: string;
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
    reportId: row.report_id,
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
  reportId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: string;
}): void {
  const insertParent = stmt(`INSERT INTO saved_explanations
    (id, user_id, report_id, selected_text, context_before, context_after, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertMsg = stmt(`INSERT INTO explanation_messages
    (id, explanation_id, role, content, created_at, sequence)
    VALUES (?, ?, ?, ?, ?, ?)`);

  db().transaction(() => {
    insertParent.run(
      args.id, args.userId, args.reportId,
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

export function getExplanationsByReport(reportId: string, userId: string): SavedExplanation[] {
  const rows = stmt('SELECT * FROM saved_explanations WHERE report_id = ? AND user_id = ? ORDER BY updated_at DESC')
    .all(reportId, userId) as ExplanationRow[];
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
