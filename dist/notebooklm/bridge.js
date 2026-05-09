/**
 * notebooklm/bridge.ts
 *
 * Puente entre el MCP server y la librería notebooklm-py de Python.
 * Ejecuta comandos `notebooklm` via subprocess y parsea las respuestas JSON.
 *
 * Prerequisito: pip install "notebooklm-py[browser]" + notebooklm login
 */
import { spawn } from "child_process";
import { cacheNotebooks, cacheSource, getCachedNotebooks, getCachedSources } from "../storage/db.js";
/**
 * Singleton que gestiona la comunicación con notebooklm-py
 */
export class NotebookLMBridge {
    static instance;
    pythonCmd;
    constructor() {
        // Detectar comando Python disponible
        this.pythonCmd = process.env.NOTEBOOKLM_PYTHON_CMD ?? "notebooklm";
    }
    static getInstance() {
        if (!NotebookLMBridge.instance) {
            NotebookLMBridge.instance = new NotebookLMBridge();
        }
        return NotebookLMBridge.instance;
    }
    /**
     * Ejecuta un comando notebooklm-py y retorna el output como string
     */
    async runCommand(args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(this.pythonCmd, args, {
                env: { ...process.env },
                stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (data) => {
                stdout += data.toString();
            });
            proc.stderr.on("data", (data) => {
                stderr += data.toString();
            });
            proc.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(`notebooklm-py falló (código ${code}): ${stderr || stdout}`));
                }
                else {
                    resolve(stdout.trim());
                }
            });
            proc.on("error", (err) => {
                reject(new Error(`No se pudo ejecutar 'notebooklm'. Instala notebooklm-py: pip install "notebooklm-py[browser]". Error: ${err.message}`));
            });
            // Timeout de 120 segundos para operaciones largas
            const timeout = setTimeout(() => {
                proc.kill();
                reject(new Error("notebooklm-py timeout después de 120 segundos"));
            }, 120_000);
            proc.on("close", () => clearTimeout(timeout));
        });
    }
    /**
     * Ejecuta un comando y parsea la salida JSON
     */
    async runJson(args) {
        const output = await this.runCommand([...args, "--json"]);
        try {
            return JSON.parse(output);
        }
        catch {
            throw new Error(`No se pudo parsear respuesta JSON de notebooklm-py: ${output.slice(0, 200)}`);
        }
    }
    /**
     * Verifica si notebooklm-py está instalado y autenticado
     */
    async checkAuth() {
        try {
            await this.runCommand(["auth", "check"]);
            return { installed: true, authenticated: true, message: "OK" };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("No se pudo ejecutar")) {
                return {
                    installed: false,
                    authenticated: false,
                    message: `notebooklm-py no instalado. Ejecuta: pip install "notebooklm-py[browser]" && notebooklm login`,
                };
            }
            return {
                installed: true,
                authenticated: false,
                message: `No autenticado. Ejecuta: notebooklm login`,
            };
        }
    }
    /**
     * Lista todos los cuadernos NotebookLM
     */
    async listNotebooks() {
        try {
            // Intentar obtener datos en vivo
            const raw = await this.runJson(["list"]);
            const notebooks = raw.notebooks ?? raw.items ?? (Array.isArray(raw) ? raw : []);
            // Guardar en caché
            cacheNotebooks(notebooks.map((nb) => ({
                id: nb.id,
                title: nb.title,
                source_count: nb.source_count ?? 0,
                metadata: JSON.stringify(nb),
                cached_at: Date.now(),
            })));
            return notebooks;
        }
        catch (err) {
            // Fallback a caché local
            const cached = getCachedNotebooks();
            if (cached.length > 0) {
                console.error("[bridge] Usando caché local de cuadernos:", err instanceof Error ? err.message : err);
                return cached.map((c) => ({
                    id: c.id,
                    title: c.title,
                    source_count: c.source_count,
                }));
            }
            throw err;
        }
    }
    /**
     * Obtiene metadatos de un cuaderno específico
     */
    async getNotebook(notebookId) {
        await this.runCommand(["use", notebookId]);
        const meta = await this.runJson(["metadata"]);
        return meta.notebook
            ? { ...meta.notebook, sources: meta.sources }
            : { id: notebookId, title: "Cuaderno", sources: meta.sources ?? [] };
    }
    /**
     * Lista las fuentes de un cuaderno
     */
    async listSources(notebookId) {
        try {
            await this.runCommand(["use", notebookId]);
            const raw = await this.runJson(["source", "list"]);
            const sources = Array.isArray(raw) ? raw : (raw.sources ?? []);
            // Caché básico de metadatos
            for (const s of sources) {
                cacheSource({
                    id: s.id,
                    notebook_id: notebookId,
                    title: s.title,
                    type: s.type,
                    metadata: JSON.stringify(s),
                    cached_at: Date.now(),
                });
            }
            return sources;
        }
        catch (err) {
            // Fallback a caché
            const cached = getCachedSources(notebookId);
            if (cached.length > 0) {
                return cached.map((c) => ({
                    id: c.id,
                    notebook_id: c.notebook_id,
                    title: c.title,
                    type: c.type,
                }));
            }
            throw err;
        }
    }
    /**
     * Obtiene el contenido textual de una fuente
     */
    async getSourceContent(notebookId, sourceId) {
        await this.runCommand(["use", notebookId]);
        const output = await this.runCommand([
            "source", "content", sourceId
        ]);
        // Cachear contenido
        cacheSource({
            id: sourceId,
            notebook_id: notebookId,
            content: output,
            cached_at: Date.now(),
        });
        return output;
    }
    /**
     * Busca en las fuentes de un cuaderno usando el chat de NotebookLM
     */
    async searchSources(notebookId, query) {
        await this.runCommand(["use", notebookId]);
        const output = await this.runJson(["ask", query]);
        return {
            answer: output.answer ?? output.text ?? JSON.stringify(output),
            sources_cited: output.sources,
        };
    }
    /**
     * Agrega una fuente al cuaderno
     */
    async addSource(notebookId, source, sourceType) {
        await this.runCommand(["use", notebookId]);
        let args;
        if (sourceType === "text" || (!sourceType && !source.startsWith("http") && !source.startsWith(".") && !source.startsWith("/"))) {
            // Texto directo
            args = ["source", "add", "--text", source];
        }
        else {
            args = ["source", "add", source];
        }
        try {
            const output = await this.runCommand([...args, "--wait"]);
            return { success: true, message: `Fuente agregada correctamente: ${output.slice(0, 100)}` };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { success: false, message: `Error al agregar fuente: ${msg}` };
        }
    }
    /**
     * Hace una pregunta al cuaderno
     */
    async askNotebook(notebookId, question) {
        await this.runCommand(["use", notebookId]);
        const output = await this.runJson(["ask", question]);
        return {
            answer: output.answer ?? output.text ?? JSON.stringify(output),
            sources_cited: output.sources,
        };
    }
}
//# sourceMappingURL=bridge.js.map