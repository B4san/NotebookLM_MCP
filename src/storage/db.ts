/**
 * storage/db.ts
 *
 * Base de datos SQLite local para:
 *   1. Caché de sesiones de CLIs (claude-code, gemini-cli, opencode)
 *   2. Caché de metadatos de NotebookLM (cuadernos, fuentes)
 *   3. Índice de búsqueda por texto completo
 */

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// Ruta de la base de datos en el directorio de configuración del usuario
const DB_DIR = path.join(os.homedir(), ".config", "notebooklm-mcp");
const DB_PATH = path.join(DB_DIR, "sessions.db");

let db: Database.Database;

export async function initDb(): Promise<void> {
  // Crear directorio si no existe
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Optimizaciones de rendimiento SQLite
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -32000"); // 32MB de caché

  // Crear tablas
  db.exec(`
    -- Sesiones de CLIs agénticos
    CREATE TABLE IF NOT EXISTS cli_sessions (
      id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      project_path TEXT,
      file_path TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Índice de búsqueda full-text para sesiones
    CREATE VIRTUAL TABLE IF NOT EXISTS cli_sessions_fts USING fts5(
      id UNINDEXED,
      tool,
      title,
      content,
      content='cli_sessions',
      content_rowid='rowid'
    );

    -- Triggers para mantener FTS sincronizado
    CREATE TRIGGER IF NOT EXISTS cli_sessions_ai AFTER INSERT ON cli_sessions BEGIN
      INSERT INTO cli_sessions_fts(rowid, id, tool, title, content)
        VALUES (new.rowid, new.id, new.tool, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS cli_sessions_au AFTER UPDATE ON cli_sessions BEGIN
      INSERT INTO cli_sessions_fts(cli_sessions_fts, rowid, id, tool, title, content)
        VALUES ('delete', old.rowid, old.id, old.tool, old.title, old.content);
      INSERT INTO cli_sessions_fts(rowid, id, tool, title, content)
        VALUES (new.rowid, new.id, new.tool, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS cli_sessions_ad AFTER DELETE ON cli_sessions BEGIN
      INSERT INTO cli_sessions_fts(cli_sessions_fts, rowid, id, tool, title, content)
        VALUES ('delete', old.rowid, old.id, old.tool, old.title, old.content);
    END;

    -- Caché de cuadernos NotebookLM
    CREATE TABLE IF NOT EXISTS notebooks_cache (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_count INTEGER DEFAULT 0,
      metadata TEXT,
      cached_at INTEGER NOT NULL
    );

    -- Caché de fuentes NotebookLM
    CREATE TABLE IF NOT EXISTS sources_cache (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL,
      title TEXT,
      type TEXT,
      content TEXT,
      metadata TEXT,
      cached_at INTEGER NOT NULL,
      FOREIGN KEY (notebook_id) REFERENCES notebooks_cache(id)
    );

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_sessions_tool ON cli_sessions(tool);
    CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON cli_sessions(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_sources_notebook ON sources_cache(notebook_id);
  `);

  console.error(`[db] Base de datos inicializada en: ${DB_PATH}`);
}

function getDb(): Database.Database {
  if (!db) throw new Error("Base de datos no inicializada. Llama initDb() primero.");
  return db;
}

// ─── Sesiones CLI ──────────────────────────────────────────────────────────

export interface CliSession {
  id: string;
  tool: string;
  project_path?: string;
  file_path: string;
  title?: string;
  content: string;
  message_count: number;
  timestamp: number;
  updated_at: number;
}

export function upsertCliSession(session: CliSession): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO cli_sessions
      (id, tool, project_path, file_path, title, content, message_count, timestamp, updated_at)
    VALUES
      (@id, @tool, @project_path, @file_path, @title, @content, @message_count, @timestamp, @updated_at)
  `).run(session);
}

export function listCliSessions(
  tool?: string,
  limit = 20
): CliSession[] {
  const database = getDb();
  if (tool && tool !== "all") {
    return database.prepare(`
      SELECT * FROM cli_sessions WHERE tool = ? ORDER BY timestamp DESC LIMIT ?
    `).all(tool, limit) as CliSession[];
  }
  return database.prepare(`
    SELECT * FROM cli_sessions ORDER BY timestamp DESC LIMIT ?
  `).all(limit) as CliSession[];
}

export function getCliSession(id: string): CliSession | undefined {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM cli_sessions WHERE id = ?"
  ).get(id) as CliSession | undefined;
}

export function searchCliSessions(
  query: string,
  tool?: string,
  limit = 10
): CliSession[] {
  const database = getDb();
  const sanitized = query.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s]/g, " ").trim();

  if (!sanitized) return [];

  try {
    if (tool && tool !== "all") {
      return database.prepare(`
        SELECT s.* FROM cli_sessions s
        INNER JOIN cli_sessions_fts fts ON s.rowid = fts.rowid
        WHERE cli_sessions_fts MATCH ? AND s.tool = ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, tool, limit) as CliSession[];
    }
    return database.prepare(`
      SELECT s.* FROM cli_sessions s
      INNER JOIN cli_sessions_fts fts ON s.rowid = fts.rowid
      WHERE cli_sessions_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(sanitized, limit) as CliSession[];
  } catch {
    // Fallback a LIKE si FTS falla
    const likeQuery = `%${sanitized}%`;
    if (tool && tool !== "all") {
      return database.prepare(`
        SELECT * FROM cli_sessions
        WHERE (content LIKE ? OR title LIKE ?) AND tool = ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(likeQuery, likeQuery, tool, limit) as CliSession[];
    }
    return database.prepare(`
      SELECT * FROM cli_sessions
      WHERE content LIKE ? OR title LIKE ?
      ORDER BY timestamp DESC LIMIT ?
    `).all(likeQuery, likeQuery, limit) as CliSession[];
  }
}

export function getSessionsByDateRange(
  sinceTs: number,
  limit = 100
): CliSession[] {
  const database = getDb();
  return database.prepare(`
    SELECT * FROM cli_sessions WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?
  `).all(sinceTs, limit) as CliSession[];
}

// ─── Caché de NotebookLM ──────────────────────────────────────────────────

export interface NotebookCache {
  id: string;
  title: string;
  source_count: number;
  metadata?: string;
  cached_at: number;
}

export function cacheNotebooks(notebooks: NotebookCache[]): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO notebooks_cache (id, title, source_count, metadata, cached_at)
    VALUES (@id, @title, @source_count, @metadata, @cached_at)
  `);
  const now = Date.now();
  const insert = database.transaction((nbs: NotebookCache[]) => {
    for (const nb of nbs) stmt.run({ ...nb, cached_at: now });
  });
  insert(notebooks);
}

export function getCachedNotebooks(): NotebookCache[] {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM notebooks_cache ORDER BY title"
  ).all() as NotebookCache[];
}

export interface SourceCache {
  id: string;
  notebook_id: string;
  title?: string;
  type?: string;
  content?: string;
  metadata?: string;
  cached_at: number;
}

export function cacheSource(source: SourceCache): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO sources_cache
      (id, notebook_id, title, type, content, metadata, cached_at)
    VALUES
      (@id, @notebook_id, @title, @type, @content, @metadata, @cached_at)
  `).run({ ...source, cached_at: Date.now() });
}

export function getCachedSources(notebookId: string): SourceCache[] {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM sources_cache WHERE notebook_id = ? ORDER BY title"
  ).all(notebookId) as SourceCache[];
}

export function getCachedSource(
  notebookId: string,
  sourceId: string
): SourceCache | undefined {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM sources_cache WHERE notebook_id = ? AND id = ?"
  ).get(notebookId, sourceId) as SourceCache | undefined;
}
