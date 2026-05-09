/**
 * watchers/index.ts
 *
 * Coordina todos los watchers de sesiones CLI.
 * Monitorea cambios en los archivos de sesión de cada CLI agéntico.
 */
import { watchClaudeCode } from "./claude-code.js";
import { watchGeminiCLI } from "./gemini-cli.js";
import { watchOpenCode } from "./opencode.js";
export async function startWatchers() {
    console.error("[watchers] Iniciando watchers de sesiones CLI...");
    const watchers = [
        { name: "Claude Code", fn: watchClaudeCode },
        { name: "Gemini CLI", fn: watchGeminiCLI },
        { name: "OpenCode", fn: watchOpenCode },
    ];
    for (const { name, fn } of watchers) {
        try {
            await fn();
            console.error(`[watchers] ✓ ${name} watcher activo`);
        }
        catch (err) {
            // No fallar si una CLI no está instalada
            console.error(`[watchers] ℹ ${name} no encontrado o sin sesiones: ${err instanceof Error ? err.message : err}`);
        }
    }
}
//# sourceMappingURL=index.js.map