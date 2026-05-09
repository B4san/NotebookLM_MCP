#!/usr/bin/env node
/**
 * notebooklm-mcp — MCP Server principal
 *
 * Expone herramientas para interactuar con Google NotebookLM
 * desde cualquier CLI agéntico (Claude Code, Gemini CLI, OpenCode, Codex).
 *
 * Arquitectura:
 *   - Transporte: stdio (compatible con todos los CLIs)
 *   - Integración NotebookLM: via notebooklm-py (subprocess Python)
 *   - Storage local: SQLite para caché de sesiones de CLIs
 *   - Watchers: monitoreo de sesiones de Claude Code, Gemini CLI, OpenCode
 */
export {};
//# sourceMappingURL=server.d.ts.map