/**
 * watchers/gemini-cli.ts
 *
 * Monitorea las sesiones de Gemini CLI guardadas en:
 *   ~/.gemini/tmp/<project-hash>/chats/session-*.json
 */
import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import os from "os";
import { upsertCliSession } from "../storage/db.js";
const GEMINI_TMP_PATH = path.join(os.homedir(), ".gemini", "tmp");
/**
 * Parsea un archivo JSON de sesión de Gemini CLI
 */
function parseGeminiSession(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const session = JSON.parse(raw);
    const msgs = session.messages ?? session.history ?? [];
    const messages = [];
    let firstUserMessage = "";
    let messageCount = 0;
    for (const msg of msgs) {
        const role = msg.role ?? "unknown";
        let text = msg.content ?? "";
        if (!text && msg.parts) {
            text = msg.parts.map((p) => p.text ?? "").join(" ");
        }
        if (!text.trim())
            continue;
        messageCount++;
        if (role === "user" && !firstUserMessage) {
            firstUserMessage = text.slice(0, 100);
        }
        const prefix = role === "user"
            ? "👤 Usuario"
            : role === "model" || role === "assistant"
                ? "🤖 Gemini"
                : `[${role}]`;
        messages.push(`${prefix}: ${text}`);
    }
    return {
        content: messages.join("\n\n"),
        messageCount,
        title: firstUserMessage || path.basename(filePath, ".json"),
        projectPath: session.projectPath,
    };
}
/**
 * Ingesta un archivo de sesión de Gemini CLI
 */
async function ingestGeminiSession(filePath) {
    try {
        if (!filePath.endsWith(".json"))
            return;
        const stat = fs.statSync(filePath);
        if (stat.size < 10)
            return;
        const { content, messageCount, title, projectPath } = parseGeminiSession(filePath);
        if (!content.trim())
            return;
        // Extraer hash del proyecto del path: ~/.gemini/tmp/<hash>/chats/session-*.json
        const parts = filePath.split(path.sep);
        const hashIdx = parts.indexOf("tmp") + 1;
        const projectHash = hashIdx < parts.length ? parts[hashIdx] : "unknown";
        const sessionId = `gemini-${path.basename(filePath, ".json")}`;
        const session = {
            id: sessionId,
            tool: "gemini-cli",
            project_path: projectPath ?? projectHash,
            file_path: filePath,
            title: title?.slice(0, 200),
            content,
            message_count: messageCount,
            timestamp: stat.birthtimeMs || stat.mtimeMs,
            updated_at: stat.mtimeMs,
        };
        upsertCliSession(session);
        console.error(`[gemini-watcher] Sesión indexada: ${sessionId} (${messageCount} msgs)`);
    }
    catch (err) {
        console.error(`[gemini-watcher] Error al ingestar ${filePath}:`, err);
    }
}
export async function watchGeminiCLI() {
    if (!fs.existsSync(GEMINI_TMP_PATH)) {
        console.error(`[gemini-watcher] Directorio no encontrado: ${GEMINI_TMP_PATH}`);
        return;
    }
    const pattern = path.join(GEMINI_TMP_PATH, "**", "*.json");
    chokidar
        .watch(pattern, {
        ignoreInitial: false,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
    })
        .on("add", (filePath) => ingestGeminiSession(filePath))
        .on("change", (filePath) => ingestGeminiSession(filePath))
        .on("error", (err) => console.error("[gemini-watcher] Error del watcher:", err));
}
//# sourceMappingURL=gemini-cli.js.map