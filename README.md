# NotebookLM MCP 🤖📚

> Servidor MCP que conecta tus CLIs agénticos (Claude Code, Gemini CLI, OpenCode, Codex) con Google NotebookLM.

## ¿Qué hace?

- 🔍 **Consulta fuentes** de cualquier cuaderno NotebookLM desde tu CLI
- 📄 **Lee el contenido** completo de documentos, PDFs y URLs indexadas
- ❓ **Pregunta** al cuaderno y obtén respuestas fundamentadas en las fuentes
- ➕ **Agrega fuentes** (URLs, archivos, texto) a tus cuadernos
- 🗂️ **Indexa sesiones** de Claude Code, Gemini CLI y OpenCode automáticamente
- 🔎 **Busca en el historial** de todas tus sesiones de CLIs
- 📤 **Exporta sesiones** de CLIs a NotebookLM como fuentes
- 📅 **Timeline unificado** de actividad en todas las herramientas

## Instalación rápida

```bash
# 1. Clonar / ir al directorio
cd "/home/sebas/Documents/notebooklm MCP"

# 2. Ejecutar instalador
bash install.sh
```

## Instalación manual

### Prerrequisitos

```bash
# Node.js 18+
node --version

# Python 3.8+
python3 --version

# Instalar notebooklm-py
pip install "notebooklm-py[browser]"
playwright install chromium

# Autenticarse con NotebookLM
notebooklm login
```

### Build

```bash
npm install
npm run build
```

## Configuración en los CLIs

### Claude Code

Agrega en `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/home/sebas/Documents/notebooklm MCP/dist/server.js"]
    }
  }
}
```

O usa el CLI:

```bash
claude mcp add notebooklm --type stdio --command node --args "/home/sebas/Documents/notebooklm MCP/dist/server.js"
```

### Gemini CLI

Agrega en `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["/home/sebas/Documents/notebooklm MCP/dist/server.js"]
    }
  }
}
```

### OpenCode

Agrega en `opencode.json` del proyecto o global:

```json
{
  "mcp": {
    "notebooklm": {
      "type": "local",
      "command": ["node", "/home/sebas/Documents/notebooklm MCP/dist/server.js"],
      "enabled": true
    }
  }
}
```

## Herramientas disponibles

### NotebookLM — Cuadernos

| Herramienta | Descripción |
|---|---|
| `list_notebooks` | Lista todos tus cuadernos con ID y número de fuentes |
| `get_notebook` | Obtiene metadatos completos de un cuaderno |

### NotebookLM — Fuentes

| Herramienta | Descripción |
|---|---|
| `list_sources` | Lista todas las fuentes de un cuaderno |
| `get_source_content` | Lee el contenido textual completo de una fuente |
| `search_sources` | Busca en las fuentes con lenguaje natural |
| `add_source` | Agrega URL, archivo o texto como nueva fuente |

### NotebookLM — Chat

| Herramienta | Descripción |
|---|---|
| `ask_notebook` | Pregunta al cuaderno sobre sus fuentes |

### Sesiones CLI

| Herramienta | Descripción |
|---|---|
| `list_cli_sessions` | Lista sesiones indexadas de todos los CLIs |
| `get_cli_session` | Lee una sesión completa por ID |
| `search_cli_sessions` | Busca en el historial de todas las sesiones |
| `export_session_to_notebook` | Exporta una sesión a NotebookLM como fuente |
| `get_activity_timeline` | Timeline de actividad unificada |

## Ejemplo de uso

```
# En Claude Code, Gemini CLI, o OpenCode:

"Lista mis cuadernos de NotebookLM"
→ list_notebooks()

"¿Qué dice mi cuaderno sobre machine learning?"
→ ask_notebook(notebook_id="...", question="¿Qué dice sobre machine learning?")

"Muestra las fuentes del cuaderno de investigación"
→ list_sources(notebook_id="...")

"Busca cuando trabajé en autenticación JWT en cualquier sesión"
→ search_cli_sessions(query="autenticación JWT")

"Exporta mi última sesión de Claude Code a mi cuaderno de proyectos"
→ export_session_to_notebook(session_id="...", notebook_id="...")
```

## Arquitectura

```
notebooklm MCP/
├── src/
│   ├── server.ts              # MCP server principal (stdio)
│   ├── notebooklm/
│   │   └── bridge.ts          # Puente con notebooklm-py (subprocess)
│   ├── storage/
│   │   └── db.ts              # SQLite + FTS5 para búsqueda de sesiones
│   ├── tools/
│   │   └── handlers.ts        # Handlers para cada herramienta MCP
│   └── watchers/
│       ├── index.ts           # Coordinador de watchers
│       ├── claude-code.ts     # Watcher de ~/.claude/projects/
│       ├── gemini-cli.ts      # Watcher de ~/.gemini/tmp/
│       └── opencode.ts        # Watcher de ~/.local/share/opencode/
├── config/
│   ├── claude-code.json       # Config para Claude Code
│   ├── gemini-cli-settings.json
│   └── opencode.json
└── install.sh                 # Instalador automático
```

## Rutas de sesiones monitoreadas

| CLI | Ruta |
|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Gemini CLI | `~/.gemini/tmp/**/*.json` |
| OpenCode | `~/.local/share/opencode/**/*.json` |

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| MCP Server | `@modelcontextprotocol/sdk` + TypeScript |
| Watchers | `chokidar` |
| Storage local | `better-sqlite3` + FTS5 |
| Integración NotebookLM | `notebooklm-py` (subprocess) |
| Runtime dev | `tsx` |

## Nota sobre NotebookLM

NotebookLM no tiene API pública. Este MCP usa [notebooklm-py](https://github.com/teng-lin/notebooklm-py), una librería no oficial que automatiza las llamadas internas de la web de NotebookLM. Úsala para proyectos personales o de investigación.

## Licencia

MIT
# NotebookLM_MCP
