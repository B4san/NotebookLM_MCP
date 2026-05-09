/**
 * watchers/claude-code.ts
 *
 * Monitorea las sesiones de Claude Code guardadas en:
 *   ~/.claude/projects/<project-hash>/<uuid>.jsonl
 *
 * Formato JSONL: cada línea es un mensaje/evento de la sesión
 */

import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import os from "os";
import { upsertCliSession } from "../storage/db.js";
import type { CliSession } from "../storage/db.js";
import crypto from "crypto";

const CLAUDE_SESSIONS_PATH = path.join(os.homedir(), ".claude", "projects");

interface ClaudeMessage {
  type?: string;
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
  message?: { role?: string; content?: string | Array<{ type: string; text?: string }> };
}

/**
 * Extrae texto legible de un mensaje de Claude Code
 */
function extractText(msg: ClaudeMessage): string {
  const content = msg.content ?? msg.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text ?? "")
      .join("\n");
  }
  return "";
}

/**
 * Parsea un archivo JSONL de sesión de Claude Code
 */
function parseClaudeSession(filePath: string): {
  content: string;
  messageCount: number;
  title?: string;
} {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);

  const messages: string[] = [];
  let firstUserMessage = "";
  let messageCount = 0;

  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as ClaudeMessage;
      const role = msg.role ?? msg.message?.role ?? "unknown";
      const text = extractText(msg);

      if (!text) continue;
      messageCount++;

      if (role === "user" && !firstUserMessage) {
        firstUserMessage = text.slice(0, 100);
      }

      const prefix = role === "user" ? "👤 Usuario" : role === "assistant" ? "🤖 Claude" : `[${role}]`;
      messages.push(`${prefix}: ${text}`);
    } catch {
      // Saltar líneas malformadas
    }
  }

  return {
    content: messages.join("\n\n"),
    messageCount,
    title: firstUserMessage || path.basename(filePath, ".jsonl"),
  };
}

/**
 * Ingesta un archivo de sesión de Claude Code en la base de datos
 */
async function ingestClaudeSession(filePath: string): Promise<void> {
  try {
    const stat = fs.statSync(filePath);

    // Solo procesar archivos .jsonl con contenido
    if (!filePath.endsWith(".jsonl") || stat.size < 10) return;

    const { content, messageCount, title } = parseClaudeSession(filePath);
    if (!content.trim()) return;

    // Extraer path del proyecto del directorio padre
    const parentDir = path.basename(path.dirname(filePath));
    const projectPath = parentDir.replace(/-/g, "/").replace(/^\//, "");

    // Usar el nombre del archivo (UUID) como ID
    const sessionId = `claude-${path.basename(filePath, ".jsonl")}`;

    const session: CliSession = {
      id: sessionId,
      tool: "claude-code",
      project_path: projectPath,
      file_path: filePath,
      title: title?.slice(0, 200),
      content,
      message_count: messageCount,
      timestamp: stat.birthtimeMs || stat.mtimeMs,
      updated_at: stat.mtimeMs,
    };

    upsertCliSession(session);
    console.error(`[claude-watcher] Sesión indexada: ${sessionId} (${messageCount} msgs)`);
  } catch (err) {
    console.error(`[claude-watcher] Error al ingestar ${filePath}:`, err);
  }
}

export async function watchClaudeCode(): Promise<void> {
  if (!fs.existsSync(CLAUDE_SESSIONS_PATH)) {
    console.error(
      `[claude-watcher] Directorio no encontrado: ${CLAUDE_SESSIONS_PATH}`
    );
    return;
  }

  // Indexar sesiones existentes
  const pattern = path.join(CLAUDE_SESSIONS_PATH, "**", "*.jsonl");

  chokidar
    .watch(pattern, {
      ignoreInitial: false,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
    })
    .on("add", (filePath) => ingestClaudeSession(filePath))
    .on("change", (filePath) => ingestClaudeSession(filePath))
    .on("error", (err) =>
      console.error("[claude-watcher] Error del watcher:", err)
    );
}
