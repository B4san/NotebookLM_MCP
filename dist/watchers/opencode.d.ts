/**
 * watchers/opencode.ts
 *
 * Monitorea las sesiones de OpenCode CLI guardadas en:
 *   ~/.local/share/opencode/  o  ~/.config/opencode/
 *
 * OpenCode usa SQLite internamente, pero también puede exportar JSON.
 * Este watcher monitorea los archivos de sesión exportados.
 */
export declare function watchOpenCode(): Promise<void>;
//# sourceMappingURL=opencode.d.ts.map