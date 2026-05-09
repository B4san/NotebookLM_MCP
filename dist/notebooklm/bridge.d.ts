/**
 * notebooklm/bridge.ts
 *
 * Puente entre el MCP server y la librería notebooklm-py de Python.
 * Ejecuta comandos `notebooklm` via subprocess y parsea las respuestas JSON.
 *
 * Prerequisito: pip install "notebooklm-py[browser]" + notebooklm login
 */
export interface Notebook {
    id: string;
    title: string;
    source_count?: number;
    created_at?: string;
    updated_at?: string;
}
export interface Source {
    id: string;
    notebook_id: string;
    title?: string;
    type?: string;
    url?: string;
    content?: string;
}
export interface ChatAnswer {
    answer: string;
    sources_cited?: string[];
}
/**
 * Singleton que gestiona la comunicación con notebooklm-py
 */
export declare class NotebookLMBridge {
    private static instance;
    private pythonCmd;
    private constructor();
    static getInstance(): NotebookLMBridge;
    /**
     * Ejecuta un comando notebooklm-py y retorna el output como string
     */
    private runCommand;
    /**
     * Ejecuta un comando y parsea la salida JSON
     */
    private runJson;
    /**
     * Verifica si notebooklm-py está instalado y autenticado
     */
    checkAuth(): Promise<{
        installed: boolean;
        authenticated: boolean;
        message: string;
    }>;
    /**
     * Lista todos los cuadernos NotebookLM
     */
    listNotebooks(): Promise<Notebook[]>;
    /**
     * Obtiene metadatos de un cuaderno específico
     */
    getNotebook(notebookId: string): Promise<Notebook & {
        sources?: Source[];
    }>;
    /**
     * Lista las fuentes de un cuaderno
     */
    listSources(notebookId: string): Promise<Source[]>;
    /**
     * Obtiene el contenido textual de una fuente
     */
    getSourceContent(notebookId: string, sourceId: string): Promise<string>;
    /**
     * Busca en las fuentes de un cuaderno usando el chat de NotebookLM
     */
    searchSources(notebookId: string, query: string): Promise<ChatAnswer>;
    /**
     * Agrega una fuente al cuaderno
     */
    addSource(notebookId: string, source: string, sourceType?: "url" | "file" | "text"): Promise<{
        success: boolean;
        source_id?: string;
        message: string;
    }>;
    /**
     * Hace una pregunta al cuaderno
     */
    askNotebook(notebookId: string, question: string): Promise<ChatAnswer>;
}
//# sourceMappingURL=bridge.d.ts.map