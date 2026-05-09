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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";

import { initDb } from "./storage/db.js";
import { startWatchers } from "./watchers/index.js";
import { NotebookLMBridge } from "./notebooklm/bridge.js";
import {
  handleListNotebooks,
  handleGetNotebook,
  handleListSources,
  handleGetSourceContent,
  handleSearchSources,
  handleAddSource,
  handleAskNotebook,
  handleListCliSessions,
  handleGetCliSession,
  handleSearchCliSessions,
  handleExportSessionToNotebook,
  handleGetActivityTimeline,
} from "./tools/handlers.js";

// ─── Inicialización ────────────────────────────────────────────────────────
const server = new Server(
  {
    name: "notebooklm-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ─── Lista de herramientas ─────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── NotebookLM: Cuadernos ──
    {
      name: "list_notebooks",
      description:
        "Lista todos tus cuadernos de NotebookLM con su ID, título y número de fuentes.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_notebook",
      description:
        "Obtiene los metadatos completos de un cuaderno NotebookLM específico (título, fuentes, estado).",
      inputSchema: {
        type: "object",
        properties: {
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM",
          },
        },
        required: ["notebook_id"],
      },
    },

    // ── NotebookLM: Fuentes ──
    {
      name: "list_sources",
      description:
        "Lista todas las fuentes (documentos, URLs, PDFs) de un cuaderno NotebookLM.",
      inputSchema: {
        type: "object",
        properties: {
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM",
          },
        },
        required: ["notebook_id"],
      },
    },
    {
      name: "get_source_content",
      description:
        "Obtiene el contenido textual completo indexado de una fuente específica en NotebookLM. Ideal para leer el texto de un PDF o documento.",
      inputSchema: {
        type: "object",
        properties: {
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM",
          },
          source_id: {
            type: "string",
            description: "ID de la fuente dentro del cuaderno",
          },
        },
        required: ["notebook_id", "source_id"],
      },
    },
    {
      name: "search_sources",
      description:
        "Busca en todas las fuentes de un cuaderno NotebookLM por palabras clave o pregunta en lenguaje natural.",
      inputSchema: {
        type: "object",
        properties: {
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM",
          },
          query: {
            type: "string",
            description: "Pregunta o términos de búsqueda",
          },
        },
        required: ["notebook_id", "query"],
      },
    },
    {
      name: "add_source",
      description:
        "Agrega una nueva fuente (URL, ruta de archivo local, o texto) a un cuaderno NotebookLM.",
      inputSchema: {
        type: "object",
        properties: {
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM",
          },
          source: {
            type: "string",
            description:
              "URL, ruta de archivo local (./file.pdf) o texto directo a agregar como fuente",
          },
          source_type: {
            type: "string",
            enum: ["url", "file", "text"],
            description: "Tipo de fuente a agregar",
          },
        },
        required: ["notebook_id", "source"],
      },
    },

    // ── NotebookLM: Chat ──
    {
      name: "ask_notebook",
      description:
        "Hace una pregunta al cuaderno NotebookLM y obtiene una respuesta fundamentada en sus fuentes.",
      inputSchema: {
        type: "object",
        properties: {
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM",
          },
          question: {
            type: "string",
            description: "Pregunta a realizar sobre las fuentes del cuaderno",
          },
        },
        required: ["notebook_id", "question"],
      },
    },

    // ── Sesiones CLI ──
    {
      name: "list_cli_sessions",
      description:
        "Lista las sesiones guardadas de tus CLIs agénticos (Claude Code, Gemini CLI, OpenCode) con filtros por herramienta, proyecto o fecha.",
      inputSchema: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: ["claude-code", "gemini-cli", "opencode", "all"],
            description: "Filtrar por herramienta CLI (default: all)",
          },
          limit: {
            type: "number",
            description: "Número máximo de sesiones a retornar (default: 20)",
          },
        },
        required: [],
      },
    },
    {
      name: "get_cli_session",
      description: "Obtiene el contenido completo de una sesión CLI por su ID.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "ID único de la sesión CLI",
          },
        },
        required: ["session_id"],
      },
    },
    {
      name: "search_cli_sessions",
      description:
        "Busca en el historial de todas tus sesiones CLI por palabras clave. Útil para encontrar cuando trabajaste en un tema específico.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Término o frase a buscar en las sesiones",
          },
          tool: {
            type: "string",
            enum: ["claude-code", "gemini-cli", "opencode", "all"],
            description: "Filtrar por herramienta (default: all)",
          },
          limit: {
            type: "number",
            description: "Número máximo de resultados (default: 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "export_session_to_notebook",
      description:
        "Exporta una sesión CLI como fuente a un cuaderno NotebookLM para que puedas consultarla con IA.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: {
            type: "string",
            description: "ID de la sesión CLI a exportar",
          },
          notebook_id: {
            type: "string",
            description: "ID del cuaderno NotebookLM destino",
          },
        },
        required: ["session_id", "notebook_id"],
      },
    },

    // ── Timeline ──
    {
      name: "get_activity_timeline",
      description:
        "Muestra una línea de tiempo unificada de tu actividad en todos los CLIs (qué hiciste, cuándo y en qué proyecto).",
      inputSchema: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Número de días a mostrar (default: 7)",
          },
        },
        required: [],
      },
    },
  ],
}));

// ─── Dispatcher de herramientas ────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const bridge = NotebookLMBridge.getInstance();

  try {
    switch (name) {
      // NotebookLM: Cuadernos
      case "list_notebooks":
        return await handleListNotebooks(bridge);
      case "get_notebook":
        return await handleGetNotebook(bridge, args as { notebook_id: string });
      // NotebookLM: Fuentes
      case "list_sources":
        return await handleListSources(
          bridge,
          args as { notebook_id: string }
        );
      case "get_source_content":
        return await handleGetSourceContent(
          bridge,
          args as { notebook_id: string; source_id: string }
        );
      case "search_sources":
        return await handleSearchSources(
          bridge,
          args as { notebook_id: string; query: string }
        );
      case "add_source":
        return await handleAddSource(
          bridge,
          args as {
            notebook_id: string;
            source: string;
            source_type?: "url" | "file" | "text";
          }
        );
      // NotebookLM: Chat
      case "ask_notebook":
        return await handleAskNotebook(
          bridge,
          args as { notebook_id: string; question: string }
        );
      // Sesiones CLI
      case "list_cli_sessions":
        return await handleListCliSessions(
          args as { tool?: string; limit?: number }
        );
      case "get_cli_session":
        return await handleGetCliSession(
          args as { session_id: string }
        );
      case "search_cli_sessions":
        return await handleSearchCliSessions(
          args as { query: string; tool?: string; limit?: number }
        );
      case "export_session_to_notebook":
        return await handleExportSessionToNotebook(
          bridge,
          args as { session_id: string; notebook_id: string }
        );
      case "get_activity_timeline":
        return await handleGetActivityTimeline(
          args as { days?: number }
        );
      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Herramienta desconocida: ${name}`
        );
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new McpError(ErrorCode.InternalError, `Error ejecutando ${name}: ${message}`);
  }
});

// ─── Recursos (MCP Resources API) ─────────────────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const bridge = NotebookLMBridge.getInstance();
  try {
    const notebooks = await bridge.listNotebooks();
    return {
      resources: notebooks.map((nb) => ({
        uri: `notebooklm://notebook/${nb.id}`,
        name: nb.title,
        description: `Cuaderno NotebookLM con ${nb.source_count ?? 0} fuentes`,
        mimeType: "application/json",
      })),
    };
  } catch {
    return { resources: [] };
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const match = uri.match(/^notebooklm:\/\/notebook\/(.+)$/);
  if (!match) {
    throw new McpError(ErrorCode.InvalidRequest, `URI no reconocida: ${uri}`);
  }
  const notebookId = match[1];
  const bridge = NotebookLMBridge.getInstance();
  const sources = await bridge.listSources(notebookId);
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(sources, null, 2),
      },
    ],
  };
});

// ─── Bootstrap ────────────────────────────────────────────────────────────
async function main() {
  // Inicializar base de datos SQLite
  await initDb();

  // Iniciar watchers de sesiones CLI en background
  startWatchers().catch((err) =>
    console.error("[watchers] Error al iniciar watchers:", err)
  );

  // Conectar transporte stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[notebooklm-mcp] Servidor MCP iniciado y escuchando en stdio");
}

main().catch((err) => {
  console.error("[notebooklm-mcp] Error fatal:", err);
  process.exit(1);
});
