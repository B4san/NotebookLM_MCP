/**
 * tools/handlers.ts
 *
 * Handlers para cada herramienta MCP expuesta.
 * Cada función retorna un objeto compatible con CallToolResult de MCP SDK.
 */

import type { NotebookLMBridge } from "../notebooklm/bridge.js";
import {
  listCliSessions,
  getCliSession as dbGetCliSession,
  searchCliSessions as dbSearchCliSessions,
  getSessionsByDateRange,
} from "../storage/db.js";

type McpContent = { type: "text"; text: string };
type ToolResult = { content: McpContent[] };

/** Helper para formatear respuestas de texto */
function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Helper para formatear objetos como JSON bonito */
function jsonResult(data: unknown): ToolResult {
  return textResult(JSON.stringify(data, null, 2));
}

/** Helper para formatear errores de manera amigable */
function errorResult(message: string, hint?: string): ToolResult {
  let text = `❌ Error: ${message}`;
  if (hint) text += `\n\n💡 Sugerencia: ${hint}`;
  return textResult(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// NotebookLM: Cuadernos
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListNotebooks(
  bridge: NotebookLMBridge
): Promise<ToolResult> {
  try {
    const auth = await bridge.checkAuth();
    if (!auth.authenticated) {
      return errorResult(
        "No autenticado con NotebookLM",
        auth.message
      );
    }

    const notebooks = await bridge.listNotebooks();

    if (notebooks.length === 0) {
      return textResult(
        "📚 No tienes cuadernos en NotebookLM todavía.\n\nCrea uno en: https://notebooklm.google.com"
      );
    }

    const list = notebooks
      .map(
        (nb, i) =>
          `${i + 1}. 📓 **${nb.title}**\n   ID: ${nb.id}\n   Fuentes: ${nb.source_count ?? "?"}`
      )
      .join("\n\n");

    return textResult(
      `📚 Tus cuadernos NotebookLM (${notebooks.length} total):\n\n${list}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResult(msg, "Verifica que notebooklm-py esté instalado y autenticado: notebooklm login");
  }
}

export async function handleGetNotebook(
  bridge: NotebookLMBridge,
  args: { notebook_id: string }
): Promise<ToolResult> {
  try {
    const nb = await bridge.getNotebook(args.notebook_id);
    const sources = nb.sources ?? [];

    let text = `📓 **${nb.title}**\nID: ${nb.id}\n`;
    if (nb.created_at) text += `Creado: ${nb.created_at}\n`;
    if (nb.updated_at) text += `Actualizado: ${nb.updated_at}\n`;
    text += `\n📎 Fuentes (${sources.length}):\n`;
    text += sources
      .map((s, i) => `  ${i + 1}. ${s.title ?? s.id} [${s.type ?? "?"}]`)
      .join("\n");

    return textResult(text);
  } catch (err) {
    return errorResult(
      err instanceof Error ? err.message : String(err),
      `Verifica que el ID del cuaderno sea correcto: ${args.notebook_id}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NotebookLM: Fuentes
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListSources(
  bridge: NotebookLMBridge,
  args: { notebook_id: string }
): Promise<ToolResult> {
  try {
    const sources = await bridge.listSources(args.notebook_id);

    if (sources.length === 0) {
      return textResult(
        `📭 El cuaderno ${args.notebook_id} no tiene fuentes.\n\nUsa \`add_source\` para agregar una.`
      );
    }

    const list = sources
      .map(
        (s, i) =>
          `${i + 1}. 📄 **${s.title ?? "Sin título"}**\n   ID: ${s.id}\n   Tipo: ${s.type ?? "desconocido"}${s.url ? `\n   URL: ${s.url}` : ""}`
      )
      .join("\n\n");

    return textResult(
      `📎 Fuentes del cuaderno (${sources.length} total):\n\n${list}`
    );
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

export async function handleGetSourceContent(
  bridge: NotebookLMBridge,
  args: { notebook_id: string; source_id: string }
): Promise<ToolResult> {
  try {
    const content = await bridge.getSourceContent(
      args.notebook_id,
      args.source_id
    );
    return textResult(
      `📄 Contenido de la fuente ${args.source_id}:\n\n${content}`
    );
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

export async function handleSearchSources(
  bridge: NotebookLMBridge,
  args: { notebook_id: string; query: string }
): Promise<ToolResult> {
  try {
    const result = await bridge.searchSources(args.notebook_id, args.query);

    let text = `🔍 Búsqueda: "${args.query}"\n\n`;
    text += `📝 Respuesta:\n${result.answer}`;

    if (result.sources_cited && result.sources_cited.length > 0) {
      text += `\n\n📚 Fuentes citadas:\n${result.sources_cited.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`;
    }

    return textResult(text);
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

export async function handleAddSource(
  bridge: NotebookLMBridge,
  args: {
    notebook_id: string;
    source: string;
    source_type?: "url" | "file" | "text";
  }
): Promise<ToolResult> {
  try {
    const result = await bridge.addSource(
      args.notebook_id,
      args.source,
      args.source_type
    );

    if (result.success) {
      return textResult(
        `✅ Fuente agregada exitosamente al cuaderno ${args.notebook_id}\n\n${result.message}`
      );
    } else {
      return errorResult(result.message);
    }
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NotebookLM: Chat
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAskNotebook(
  bridge: NotebookLMBridge,
  args: { notebook_id: string; question: string }
): Promise<ToolResult> {
  try {
    const result = await bridge.askNotebook(args.notebook_id, args.question);

    let text = `❓ Pregunta: ${args.question}\n\n`;
    text += `🤖 Respuesta de NotebookLM:\n${result.answer}`;

    if (result.sources_cited && result.sources_cited.length > 0) {
      text += `\n\n📚 Fuentes:\n${result.sources_cited.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`;
    }

    return textResult(text);
  } catch (err) {
    return errorResult(
      err instanceof Error ? err.message : String(err),
      "Asegúrate de que el cuaderno tenga fuentes cargadas"
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesiones CLI
// ─────────────────────────────────────────────────────────────────────────────

export async function handleListCliSessions(args: {
  tool?: string;
  limit?: number;
}): Promise<ToolResult> {
  const sessions = listCliSessions(args.tool, args.limit ?? 20);

  if (sessions.length === 0) {
    return textResult(
      "📭 No hay sesiones de CLIs indexadas aún.\n\nEl servidor monitorea automáticamente:\n" +
        "  • Claude Code: ~/.claude/projects/\n" +
        "  • Gemini CLI: ~/.gemini/tmp/\n" +
        "  • OpenCode: ~/.local/share/opencode/ o ~/.config/opencode/"
    );
  }

  const toolEmojis: Record<string, string> = {
    "claude-code": "🟣",
    "gemini-cli": "🔵",
    opencode: "🟠",
  };

  const list = sessions
    .map((s, i) => {
      const emoji = toolEmojis[s.tool] ?? "⚪";
      const date = new Date(s.timestamp).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      return (
        `${i + 1}. ${emoji} **[${s.tool}]** ${s.title ?? "Sin título"}\n` +
        `   ID: ${s.id}\n` +
        `   Proyecto: ${s.project_path ?? "?"}\n` +
        `   Mensajes: ${s.message_count} · ${date}`
      );
    })
    .join("\n\n");

  return textResult(
    `🗂️ Sesiones CLI indexadas (${sessions.length}):\n\n${list}`
  );
}

export async function handleGetCliSession(args: {
  session_id: string;
}): Promise<ToolResult> {
  const session = dbGetCliSession(args.session_id);

  if (!session) {
    return errorResult(
      `Sesión no encontrada: ${args.session_id}`,
      "Usa list_cli_sessions para ver los IDs disponibles"
    );
  }

  const date = new Date(session.timestamp).toLocaleString("es-MX");
  const header =
    `📋 Sesión: ${session.title ?? "Sin título"}\n` +
    `🔧 Herramienta: ${session.tool}\n` +
    `📁 Proyecto: ${session.project_path ?? "?"}\n` +
    `📅 Fecha: ${date}\n` +
    `💬 Mensajes: ${session.message_count}\n` +
    `${"─".repeat(50)}\n\n`;

  return textResult(header + session.content);
}

export async function handleSearchCliSessions(args: {
  query: string;
  tool?: string;
  limit?: number;
}): Promise<ToolResult> {
  const sessions = dbSearchCliSessions(args.query, args.tool, args.limit ?? 10);

  if (sessions.length === 0) {
    return textResult(
      `🔍 No se encontraron sesiones con "${args.query}".\n\nIntenta con términos más generales o revisa que haya sesiones indexadas.`
    );
  }

  const list = sessions
    .map((s, i) => {
      // Mostrar fragmento relevante del contenido
      const queryIdx = s.content.toLowerCase().indexOf(args.query.toLowerCase());
      const snippet =
        queryIdx >= 0
          ? "..." +
            s.content.slice(Math.max(0, queryIdx - 50), queryIdx + 150) +
            "..."
          : s.content.slice(0, 150) + "...";

      const date = new Date(s.timestamp).toLocaleDateString("es-MX");
      return (
        `${i + 1}. **[${s.tool}]** ${s.title ?? "Sin título"} (${date})\n` +
        `   ID: ${s.id}\n` +
        `   📝 ${snippet.replace(/\n/g, " ")}`
      );
    })
    .join("\n\n");

  return textResult(
    `🔍 Resultados para "${args.query}" (${sessions.length} encontradas):\n\n${list}\n\n` +
      `💡 Usa \`get_cli_session\` con el ID para ver el contenido completo.`
  );
}

export async function handleExportSessionToNotebook(
  bridge: NotebookLMBridge,
  args: { session_id: string; notebook_id: string }
): Promise<ToolResult> {
  const session = dbGetCliSession(args.session_id);

  if (!session) {
    return errorResult(
      `Sesión no encontrada: ${args.session_id}`,
      "Usa list_cli_sessions para ver los IDs disponibles"
    );
  }

  try {
    const date = new Date(session.timestamp).toLocaleDateString("es-MX");
    const title = `[${session.tool.toUpperCase()}] ${session.title ?? "Sesión"} - ${date}`;

    // Formatear el contenido para NotebookLM
    const exportContent =
      `# ${title}\n\n` +
      `**Herramienta:** ${session.tool}\n` +
      `**Proyecto:** ${session.project_path ?? "No especificado"}\n` +
      `**Fecha:** ${date}\n` +
      `**Mensajes:** ${session.message_count}\n\n` +
      `---\n\n` +
      session.content;

    const result = await bridge.addSource(
      args.notebook_id,
      exportContent,
      "text"
    );

    if (result.success) {
      return textResult(
        `✅ Sesión exportada exitosamente a NotebookLM!\n\n` +
          `📓 Cuaderno: ${args.notebook_id}\n` +
          `📋 Sesión: ${title}\n` +
          `💬 Mensajes exportados: ${session.message_count}`
      );
    } else {
      return errorResult(result.message);
    }
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline de actividad
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGetActivityTimeline(args: {
  days?: number;
}): Promise<ToolResult> {
  const days = args.days ?? 7;
  const sinceTs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions = getSessionsByDateRange(sinceTs, 200);

  if (sessions.length === 0) {
    return textResult(
      `📅 No hay actividad en los últimos ${days} días.\n\nAsegúrate de que las CLIs estén siendo monitoreadas.`
    );
  }

  // Agrupar por día
  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const day = new Date(s.timestamp).toLocaleDateString("es-MX", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(s);
  }

  const toolEmojis: Record<string, string> = {
    "claude-code": "🟣",
    "gemini-cli": "🔵",
    opencode: "🟠",
  };

  let timeline = `📅 Timeline de actividad (últimos ${days} días):\n`;
  timeline += `📊 Total: ${sessions.length} sesiones\n\n`;

  for (const [day, daySessions] of byDay) {
    timeline += `### ${day}\n`;

    // Contar por herramienta
    const byTool = daySessions.reduce(
      (acc, s) => {
        acc[s.tool] = (acc[s.tool] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const toolSummary = Object.entries(byTool)
      .map(([tool, count]) => `${toolEmojis[tool] ?? "⚪"} ${tool}: ${count}`)
      .join(" | ");
    timeline += `${toolSummary}\n\n`;

    for (const s of daySessions.slice(0, 5)) {
      const time = new Date(s.timestamp).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const emoji = toolEmojis[s.tool] ?? "⚪";
      timeline += `  ${time} ${emoji} [${s.tool}] ${s.title ?? "Sin título"} (${s.message_count} msgs)\n`;
    }

    if (daySessions.length > 5) {
      timeline += `  ... y ${daySessions.length - 5} sesiones más\n`;
    }
    timeline += "\n";
  }

  return textResult(timeline);
}
