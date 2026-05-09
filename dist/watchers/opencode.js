/**
 * watchers/opencode.ts
 *
 * Monitorea las sesiones de OpenCode CLI guardadas en:
 *   ~/.local/share/opencode/  o  ~/.config/opencode/
 *
 * OpenCode usa SQLite internamente, pero también puede exportar JSON.
 * Este watcher monitorea los archivos de sesión exportados.
 */
import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import os from "os";
import { upsertCliSession } from "../storage/db.js";
// OpenCode puede guardar sesiones en múltiples ubicaciones
const OPENCODE_PATHS = [
    path.join(os.homedir(), ".local", "share", "opencode"),
    path.join(os.homedir(), ".config", "opencode"),
    path.join(os.homedir(), ".opencode"),
    // Variable de entorno personalizable
    ...(process.env.OPENCODE_DATA_DIR ? [process.env.OPENCODE_DATA_DIR] : []),
];
/**
 * Extrae texto de un mensaje de OpenCode
 */
function extractOpenCodeText(content) {
    if (!content)
        return "";
    if (typeof content === "string")
        return content;
    if (Array.isArray(content)) {
        return content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text ?? "")
            .join("\n");
    }
    return "";
}
/**
 * Parsea un archivo JSON de sesión de OpenCode
 */
function parseOpenCodeSession(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    // OpenCode puede guardar un array de sesiones o una sola
    const sessions = Array.isArray(data) ? data : [data];
    const session = sessions[0];
    const msgs = session.messages ?? [];
    const messages = [];
    let firstUserMessage = "";
    let messageCount = 0;
    for (const msg of msgs) {
        const role = msg.role ?? "unknown";
        const text = extractOpenCodeText(msg.content);
        if (!text.trim())
            continue;
        messageCount++;
        if (role === "user" && !firstUserMessage) {
            firstUserMessage = text.slice(0, 100);
        }
        const prefix = role === "user"
            ? "👤 Usuario"
            : role === "assistant"
                ? "🤖 OpenCode"
                : `[${role}]`;
        messages.push(`${prefix}: ${text}`);
    }
    return {
        content: messages.join("\n\n"),
        messageCount,
        title: session.title ?? firstUserMessage ?? path.basename(filePath, ".json"),
        projectPath: session.projectPath,
        sessionId: session.id,
    };
}
/**
 * Ingesta un archivo de sesión de OpenCode
 */
async function ingestOpenCodeSession(filePath) {
    try {
        if (!filePath.endsWith(".json") && !filePath.endsWith(".jsonl"))
            return;
        const stat = fs.statSync(filePath);
        if (stat.size < 10)
            return;
        // Ignorar archivos de configuración que no sean sesiones
        const basename = path.basename(filePath);
        if (basename === "opencode.json" ||
            basename === "settings.json" ||
            basename === "config.json")
            return;
        const { content, messageCount, title, projectPath, sessionId } = parseOpenCodeSession(filePath);
        if (!content.trim())
            return;
        const id = `opencode-${sessionId ?? path.basename(filePath, path.extname(filePath))}`;
        const session = {
            id,
            tool: "opencode",
            project_path: projectPath,
            file_path: filePath,
            title: title?.slice(0, 200),
            content,
            message_count: messageCount,
            timestamp: stat.birthtimeMs || stat.mtimeMs,
            updated_at: stat.mtimeMs,
        };
        upsertCliSession(session);
        console.error(`[opencode-watcher] Sesión indexada: ${id} (${messageCount} msgs)`);
    }
    catch (err) {
        // Silenciar errores de parseo (pueden ser archivos no-sesión)
        if (!(err instanceof SyntaxError)) {
            console.error(`[opencode-watcher] Error al ingestar ${filePath}:`, err);
        }
    }
}
export async function watchOpenCode() {
    const existingPaths = OPENCODE_PATHS.filter((p) => fs.existsSync(p));
    if (existingPaths.length === 0) {
        console.error("[opencode-watcher] No se encontraron directorios de OpenCode");
        return;
    }
    const patterns = existingPaths.map((p) => path.join(p, "**", "*.json"));
    for (const pattern of patterns) {
        chokidar
            .watch(pattern, {
            ignoreInitial: false,
            persistent: true,
            awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
        })
            .on("add", (filePath) => ingestOpenCodeSession(filePath))
            .on("change", (filePath) => ingestOpenCodeSession(filePath))
            .on("error", (err) => console.error("[opencode-watcher] Error del watcher:", err));
    }
}
//# sourceMappingURL=opencode.js.map