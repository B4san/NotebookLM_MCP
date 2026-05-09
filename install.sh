#!/usr/bin/env bash
# install.sh — NotebookLM MCP — Instalador v3.0
# Soporta: Arch Linux, Ubuntu/Debian, Fedora, macOS
# Auto-detecta: Claude Code, Gemini CLI, OpenCode, Codex CLI

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_ENTRY="$SCRIPT_DIR/dist/server.js"
NLMCP_VENV="$HOME/.local/share/notebooklm-mcp/venv"
NLMCP_BIN=""
PLAYWRIGHT_BIN=""
CONFIGURED_CLIS=()
WARNINGS=()

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
info() { echo -e "  ${CYAN}ℹ${RESET} $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $*"; WARNINGS+=("${*//$'\033'[*m/}"); }
err()  { echo -e "  ${RED}✗${RESET} $*"; }
step() { echo -e "\n${BOLD}▶ $*${RESET}"; }

# ── Detectar OS ────────────────────────────────────────────────────────────
detect_os() {
  [[ "$OSTYPE" == darwin* ]] && echo "macos" && return
  [ -f /etc/arch-release ]   && echo "arch"   && return
  [ -f /etc/debian_version ] && echo "debian"  && return
  [ -f /etc/fedora-release ] && echo "fedora"  && return
  [ -f /etc/os-release ] && { source /etc/os-release; echo "${ID:-linux}"; return; }
  echo "linux"
}
OS=$(detect_os)

# ── Resolver comando Python ────────────────────────────────────────────────
PY_CMD=""
for c in python3 python; do
  command -v "$c" &>/dev/null && { PY_CMD="$c"; break; }
done

# ── Buscar playwright en todas las ubicaciones posibles ───────────────────
find_playwright() {
  # 1. Primero buscar en el venv de pipx de notebooklm-py (ubicación exacta conocida)
  local pipx_venv_base="$HOME/.local/share/pipx/venvs"
  for venv_name in notebooklm-py notebooklm_py "notebooklm-py[browser]"; do
    local candidate="$pipx_venv_base/$venv_name/bin/playwright"
    [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  # 2. Escanear TODOS los venvs de pipx (por si el nombre varía)
  for f in "$pipx_venv_base"/*/bin/playwright; do
    [ -x "$f" ] && { echo "$f"; return 0; }
  done
  # 3. Venv propio del script
  [ -x "$NLMCP_VENV/bin/playwright" ] && { echo "$NLMCP_VENV/bin/playwright"; return 0; }
  # 4. En PATH
  command -v playwright 2>/dev/null && return 0
  # 5. ~/.local/bin
  [ -x "$HOME/.local/bin/playwright" ] && { echo "$HOME/.local/bin/playwright"; return 0; }
  return 1
}

# ── Instalar chromium usando el playwright correcto ────────────────────────
install_chromium() {
  PLAYWRIGHT_BIN=$(find_playwright || true)

  if [ -z "$PLAYWRIGHT_BIN" ]; then
    warn "playwright no encontrado en ninguna ubicación conocida"
    info "Intentando instalar playwright en el venv de pipx..."

    # Instalar playwright dentro del mismo venv de pipx donde está notebooklm
    local pipx_venv
    pipx_venv=$(pipx environment --value PIPX_HOME 2>/dev/null || echo "$HOME/.local/share/pipx")
    local nlm_venv=""
    for d in "$pipx_venv/venvs/notebooklm-py" "$pipx_venv/venvs/notebooklm_py"; do
      [ -d "$d" ] && { nlm_venv="$d"; break; }
    done

    if [ -n "$nlm_venv" ]; then
      info "Instalando playwright en venv: $nlm_venv"
      "$nlm_venv/bin/pip" install playwright --quiet 2>/dev/null || true
      PLAYWRIGHT_BIN="$nlm_venv/bin/playwright"
    fi
  fi

  if [ -z "$PLAYWRIGHT_BIN" ] || [ ! -x "$PLAYWRIGHT_BIN" ]; then
    warn "No se pudo localizar playwright. Chromium no instalado."
    warn "Ejecuta manualmente: pipx runpip notebooklm-py install playwright && \$(pipx environment | grep VENV)/bin/playwright install chromium"
    return 1
  fi

  info "playwright encontrado: $PLAYWRIGHT_BIN"
  info "Instalando chromium (puede tardar 1-2 min)..."

  local install_out install_rc=0
  install_out=$("$PLAYWRIGHT_BIN" install chromium 2>&1) || install_rc=$?

  if [ $install_rc -eq 0 ]; then
    ok "Chromium instalado correctamente"
    return 0
  fi

  # Workaround bug onExit en Linux
  if echo "$install_out" | grep -q "onExit is not a function"; then
    warn "Bug playwright/Linux detectado — usando workaround python -m playwright"
    local venv_py
    venv_py="$(dirname "$(dirname "$PLAYWRIGHT_BIN")")/bin/python"
    [ -x "$venv_py" ] || venv_py="$PY_CMD"
    "$venv_py" -m playwright install chromium 2>&1 | grep -v "^$" | sed 's/^/    /' || \
      warn "Workaround también falló — chromium no instalado"
    return 0
  fi

  warn "Error instalando chromium: $(echo "$install_out" | tail -3)"
  return 1
}

# ── Instalar notebooklm-py ─────────────────────────────────────────────────
install_notebooklm_py() {
  local pkg="notebooklm-py[browser]"

  # 1. Intentar pipx (ya disponible o instalable)
  local has_pipx=false
  command -v pipx &>/dev/null && has_pipx=true

  if ! $has_pipx; then
    info "pipx no encontrado — instalando..."
    case "$OS" in
      arch)   command -v sudo &>/dev/null && sudo pacman -S --noconfirm python-pipx 2>/dev/null && has_pipx=true || true ;;
      debian|ubuntu) command -v sudo &>/dev/null && sudo apt-get install -y pipx 2>/dev/null && has_pipx=true || true ;;
      fedora) command -v sudo &>/dev/null && sudo dnf install -y pipx 2>/dev/null && has_pipx=true || true ;;
      macos)  command -v brew &>/dev/null && brew install pipx 2>/dev/null && has_pipx=true || true ;;
    esac
    # Fallback: instalar pipx vía pip con --break-system-packages (último recurso)
    if ! $has_pipx; then
      "$PY_CMD" -m pip install pipx --break-system-packages --quiet 2>/dev/null && has_pipx=true || true
    fi
  fi

  if $has_pipx; then
    if pipx install "$pkg" 2>/dev/null || pipx install --force "$pkg" 2>/dev/null; then
      ok "notebooklm-py instalado con pipx"
      NLMCP_BIN="$(command -v notebooklm 2>/dev/null || echo "$HOME/.local/bin/notebooklm")"
      return 0
    fi
  fi

  # 2. Fallback: venv propio
  warn "pipx no disponible o falló — usando venv propio"
  info "Creando venv en $NLMCP_VENV..."
  mkdir -p "$(dirname "$NLMCP_VENV")"
  "$PY_CMD" -m venv "$NLMCP_VENV"
  "$NLMCP_VENV/bin/pip" install --quiet --upgrade pip
  "$NLMCP_VENV/bin/pip" install --quiet "$pkg"
  NLMCP_BIN="$NLMCP_VENV/bin/notebooklm"

  # Crear wrapper en ~/.local/bin
  mkdir -p "$HOME/.local/bin"
  cat > "$HOME/.local/bin/notebooklm" <<WRAPPER
#!/usr/bin/env bash
exec "$NLMCP_BIN" "\$@"
WRAPPER
  chmod +x "$HOME/.local/bin/notebooklm"
  export PATH="$HOME/.local/bin:$PATH"
  ok "notebooklm-py instalado en venv + wrapper en ~/.local/bin"
}

# ── Merge JSON helper ──────────────────────────────────────────────────────
# Uso: merge_mcp_json <archivo> <tipo: std|opencode>
merge_mcp_json() {
  local file="$1" type="${2:-std}"
  "$PY_CMD" - "$file" "$MCP_ENTRY" "$type" <<'PYEOF'
import json, sys, os

cfg_path, entry, mode = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(cfg_path) as f:
        cfg = json.load(f)
except Exception:
    cfg = {}

changed = False
if mode == "opencode":
    cfg.setdefault("mcp", {})
    if "notebooklm" not in cfg["mcp"]:
        cfg["mcp"]["notebooklm"] = {"type": "local", "command": ["node", entry], "enabled": True}
        changed = True
else:
    cfg.setdefault("mcpServers", {})
    if "notebooklm" not in cfg["mcpServers"]:
        cfg["mcpServers"]["notebooklm"] = {"command": "node", "args": [entry]}
        changed = True

if changed:
    with open(cfg_path, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    print("merged")
else:
    print("exists")
PYEOF
}

write_std_config() {
  local file="$1"
  cat > "$file" <<JSON
{
  "mcpServers": {
    "notebooklm": {
      "command": "node",
      "args": ["$MCP_ENTRY"]
    }
  }
}
JSON
}

# ── Configurar cada CLI ────────────────────────────────────────────────────
configure_claude_code() {
  command -v claude &>/dev/null || [ -d "$HOME/.claude" ] || return 1
  info "Claude Code detectado"
  local dir="$HOME/.claude"; mkdir -p "$dir"
  local cfg="$dir/claude_desktop_config.json"
  if [ ! -f "$cfg" ]; then
    write_std_config "$cfg"; ok "Claude Code: configurado → $cfg"
  else
    local r; r=$(merge_mcp_json "$cfg" std)
    [ "$r" = "merged" ] && ok "Claude Code: bloque agregado → $cfg" || ok "Claude Code: ya configurado"
  fi
  # También via CLI si está disponible
  if command -v claude &>/dev/null; then
    claude mcp add notebooklm --type stdio --command node --args "$MCP_ENTRY" 2>/dev/null && \
      ok "Claude Code: registrado via 'claude mcp add'" || true
  fi
  CONFIGURED_CLIS+=("Claude Code"); return 0
}

configure_gemini_cli() {
  command -v gemini &>/dev/null || [ -d "$HOME/.gemini" ] || return 1
  info "Gemini CLI detectado"
  local dir="$HOME/.gemini"; mkdir -p "$dir"
  local cfg="$dir/settings.json"
  if [ ! -f "$cfg" ]; then
    write_std_config "$cfg"; ok "Gemini CLI: configurado → $cfg"
  else
    local r; r=$(merge_mcp_json "$cfg" std)
    [ "$r" = "merged" ] && ok "Gemini CLI: bloque agregado → $cfg" || ok "Gemini CLI: ya configurado"
  fi
  CONFIGURED_CLIS+=("Gemini CLI"); return 0
}

configure_opencode() {
  command -v opencode &>/dev/null || return 1
  info "OpenCode detectado"
  local dir="$HOME/.config/opencode"; mkdir -p "$dir"
  local cfg="$dir/opencode.json"
  if [ ! -f "$cfg" ]; then
    cat > "$cfg" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "notebooklm": {
      "type": "local",
      "command": ["node", "$MCP_ENTRY"],
      "enabled": true
    }
  }
}
JSON
    ok "OpenCode: configurado → $cfg"
  else
    local r; r=$(merge_mcp_json "$cfg" opencode)
    [ "$r" = "merged" ] && ok "OpenCode: bloque agregado → $cfg" || ok "OpenCode: ya configurado"
  fi
  CONFIGURED_CLIS+=("OpenCode"); return 0
}

configure_codex() {
  command -v codex &>/dev/null || return 1
  info "Codex CLI detectado"
  local dir="$HOME/.codex"; mkdir -p "$dir"
  local cfg="$dir/config.json"
  if [ ! -f "$cfg" ]; then
    write_std_config "$cfg"; ok "Codex CLI: configurado → $cfg"
  else
    local r; r=$(merge_mcp_json "$cfg" std)
    [ "$r" = "merged" ] && ok "Codex CLI: bloque agregado → $cfg" || ok "Codex CLI: ya configurado"
  fi
  CONFIGURED_CLIS+=("Codex CLI"); return 0
}

# ── LOGIN: intentar autenticación ────────────────────────────────────────
do_login() {
  local nlm_cmd="$1"

  # Verificar que chromium existe donde playwright lo espera
  local chromium_ok=false
  local chromium_path
  chromium_path=$(find "$HOME/.cache/ms-playwright" -name "chrome" -type f 2>/dev/null | head -1 || true)
  [ -n "$chromium_path" ] && chromium_ok=true

  if ! $chromium_ok; then
    info "Chromium no encontrado en ~/.cache/ms-playwright — instalando ahora..."
    install_chromium || true
    chromium_path=$(find "$HOME/.cache/ms-playwright" -name "chrome" -type f 2>/dev/null | head -1 || true)
    [ -n "$chromium_path" ] && chromium_ok=true
  fi

  if ! $chromium_ok; then
    warn "Chromium sigue sin instalarse. El login fallará."
    warn "Solución manual:"
    warn "  pipx runpip notebooklm-py install playwright"
    PLAYWRIGHT_BIN=$(find_playwright || true)
    [ -n "$PLAYWRIGHT_BIN" ] && warn "  $PLAYWRIGHT_BIN install chromium" || \
      warn "  ~/.local/share/pipx/venvs/notebooklm-py/bin/playwright install chromium"
    return 1
  fi

  info "Abriendo navegador para login con Google..."
  "$nlm_cmd" login && ok "Login exitoso" && return 0 || {
    local exit_code=$?
    warn "Login falló (código $exit_code)"
    warn "Ejecuta manualmente después: notebooklm login"
    return 1
  }
}

# ══════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   NotebookLM MCP — Instalador v3.0       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Dependencias del sistema ────────────────────────────────────────────
step "Verificando dependencias del sistema..."

# Node.js
if ! command -v node &>/dev/null; then
  err "Node.js no encontrado. Instala v18+:"
  case "$OS" in
    arch)   echo "    sudo pacman -S nodejs npm" ;;
    debian) echo "    sudo apt install nodejs npm" ;;
    fedora) echo "    sudo dnf install nodejs" ;;
    macos)  echo "    brew install node" ;;
  esac
  exit 1
fi
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[ "$NODE_MAJOR" -lt 18 ] && { err "Node.js $(node --version) muy antiguo (mín. v18)"; exit 1; }
ok "Node.js $(node --version)"
ok "npm $(npm --version)"

# Python
[ -z "$PY_CMD" ] && { err "Python no encontrado. Instala Python 3.8+"; exit 1; }
ok "Python $($PY_CMD --version 2>&1 | awk '{print $2}')"

# ── 2. npm install ────────────────────────────────────────────────────────
step "Instalando dependencias npm..."
cd "$SCRIPT_DIR"
npm install --silent 2>/dev/null || npm install
ok "Dependencias npm instaladas"

# ── 3. Compilar TypeScript ────────────────────────────────────────────────
step "Compilando TypeScript..."
npm run build 2>&1 | sed 's/^/  /'
[ -f "$MCP_ENTRY" ] && ok "Compilación exitosa → dist/" || { err "dist/server.js no generado"; exit 1; }

# ── 4. Instalar notebooklm-py ─────────────────────────────────────────────
step "Instalando notebooklm-py..."

# Buscar binario existente
NLM_CMD=""
for candidate in \
  "$(command -v notebooklm 2>/dev/null || true)" \
  "$HOME/.local/bin/notebooklm" \
  "$HOME/.local/share/pipx/venvs/notebooklm-py/bin/notebooklm" \
  "$HOME/.local/share/pipx/venvs/notebooklm_py/bin/notebooklm" \
  "$NLMCP_VENV/bin/notebooklm"; do
  [ -x "$candidate" ] && { NLM_CMD="$candidate"; break; }
done

if [ -z "$NLM_CMD" ]; then
  install_notebooklm_py
  # Re-buscar después de instalar
  for candidate in \
    "$(command -v notebooklm 2>/dev/null || true)" \
    "$HOME/.local/bin/notebooklm" \
    "$HOME/.local/share/pipx/venvs/notebooklm-py/bin/notebooklm" \
    "$HOME/.local/share/pipx/venvs/notebooklm_py/bin/notebooklm" \
    "$NLMCP_VENV/bin/notebooklm" \
    "${NLMCP_BIN:-}"; do
    [ -x "$candidate" ] && { NLM_CMD="$candidate"; break; }
  done
  [ -z "$NLM_CMD" ] && { warn "notebooklm no encontrado post-install — reinicia la terminal"; NLM_CMD="notebooklm"; }
else
  ok "notebooklm-py ya instalado: $NLM_CMD"
fi

# ── 5. Instalar playwright/chromium ───────────────────────────────────────
step "Instalando playwright y chromium..."

# Verificar si chromium ya existe
CHROMIUM_EXISTS=false
find "$HOME/.cache/ms-playwright" -name "chrome" -type f 2>/dev/null | grep -q . && CHROMIUM_EXISTS=true

if $CHROMIUM_EXISTS; then
  ok "Chromium ya instalado en ~/.cache/ms-playwright"
else
  install_chromium || true
  # Verificar resultado
  find "$HOME/.cache/ms-playwright" -name "chrome" -type f 2>/dev/null | grep -q . && \
    ok "Chromium instalado exitosamente" || \
    warn "Chromium no instalado — ver instrucciones manuales al final"
fi

# ── 6. Actualizar ENV en configs si NLM_CMD no es estándar ───────────────
if [[ "$NLM_CMD" != "notebooklm" ]] && [[ "$NLM_CMD" == *"/"* ]]; then
  info "Guardando ruta del binario en NOTEBOOKLM_PYTHON_CMD..."
fi

# ── 7. Detectar y configurar CLIs ─────────────────────────────────────────
step "Detectando CLIs agénticos instalados..."

configure_claude_code || info "Claude Code no detectado"
configure_gemini_cli  || info "Gemini CLI no detectado"
configure_opencode    || info "OpenCode no detectado"
configure_codex       || info "Codex CLI no detectado"

[ ${#CONFIGURED_CLIS[@]} -eq 0 ] && \
  warn "No se detectó ningún CLI. Configura manualmente con los archivos en config/"

# ── 8. Login NotebookLM ────────────────────────────────────────────────────
step "Verificando autenticación con NotebookLM..."

AUTH_OK=false
if "$NLM_CMD" auth check 2>/dev/null | grep -qiE "authenticated|valid|ok"; then
  ok "Ya autenticado con NotebookLM"
  AUTH_OK=true
else
  info "Se requiere autenticación con Google"
  echo ""
  read -r -p "  ¿Deseas hacer login ahora? (s/N): " REPLY
  if [[ "${REPLY:-n}" =~ ^[sS]$ ]]; then
    do_login "$NLM_CMD" && AUTH_OK=true || true
  else
    warn "Login pendiente. Ejecuta después: $NLM_CMD login"
  fi
fi

# ── 9. Resumen ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
[ ${#WARNINGS[@]} -eq 0 ] && \
  echo -e "${BOLD}║          ✅  Instalación completada sin errores       ║${RESET}" || \
  echo -e "${BOLD}║       ⚠️   Instalación completada con advertencias     ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║${RESET}                                                      ${BOLD}║${RESET}"

if [ ${#CONFIGURED_CLIS[@]} -gt 0 ]; then
  printf "${BOLD}║${RESET}  CLIs: %-46s${BOLD}║${RESET}\n" "$(IFS=', '; echo "${CONFIGURED_CLIS[*]}")"
fi

echo -e "${BOLD}║${RESET}                                                      ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  Probar:  npm run inspect                            ${BOLD}║${RESET}"
echo -e "${BOLD}║${RESET}  Dev:     npm run dev                                ${BOLD}║${RESET}"

if ! $AUTH_OK; then
  echo -e "${BOLD}║${RESET}  Login:   $NLM_CMD login$(printf '%*s' $((40 - ${#NLM_CMD})) '')${BOLD}║${RESET}"
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo -e "${BOLD}║${RESET}                                                      ${BOLD}║${RESET}"
  echo -e "${BOLD}║${RESET}  ${YELLOW}Advertencias:${RESET}                                         ${BOLD}║${RESET}"
  for w in "${WARNINGS[@]}"; do
    printf "${BOLD}║${RESET}    ${YELLOW}⚠${RESET}  %-46s${BOLD}║${RESET}\n" "${w:0:46}"
  done
fi

echo -e "${BOLD}║${RESET}                                                      ${BOLD}║${RESET}"

# Instrucción especial si chromium faltó
if ! find "$HOME/.cache/ms-playwright" -name "chrome" -type f 2>/dev/null | grep -q .; then
  echo -e "${BOLD}║${RESET}  ${YELLOW}Para instalar chromium manualmente:${RESET}                   ${BOLD}║${RESET}"
  PLAYWRIGHT_BIN=$(find_playwright || true)
  if [ -n "$PLAYWRIGHT_BIN" ]; then
    printf "${BOLD}║${RESET}    %-50s${BOLD}║${RESET}\n" "$PLAYWRIGHT_BIN install chromium"
  else
    echo -e "${BOLD}║${RESET}    pipx runpip notebooklm-py install playwright        ${BOLD}║${RESET}"
    echo -e "${BOLD}║${RESET}    (venv pipx)/bin/playwright install chromium          ${BOLD}║${RESET}"
  fi
  echo -e "${BOLD}║${RESET}                                                      ${BOLD}║${RESET}"
fi

echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
