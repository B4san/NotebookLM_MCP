/**
 * storage/db.ts
 *
 * Base de datos SQLite local para:
 *   1. Caché de sesiones de CLIs (claude-code, gemini-cli, opencode)
 *   2. Caché de metadatos de NotebookLM (cuadernos, fuentes)
 *   3. Índice de búsqueda por texto completo
 */
export declare function initDb(): Promise<void>;
export interface CliSession {
    id: string;
    tool: string;
    project_path?: string;
    file_path: string;
    title?: string;
    content: string;
    message_count: number;
    timestamp: number;
    updated_at: number;
}
export declare function upsertCliSession(session: CliSession): void;
export declare function listCliSessions(tool?: string, limit?: number): CliSession[];
export declare function getCliSession(id: string): CliSession | undefined;
export declare function searchCliSessions(query: string, tool?: string, limit?: number): CliSession[];
export declare function getSessionsByDateRange(sinceTs: number, limit?: number): CliSession[];
export interface NotebookCache {
    id: string;
    title: string;
    source_count: number;
    metadata?: string;
    cached_at: number;
}
export declare function cacheNotebooks(notebooks: NotebookCache[]): void;
export declare function getCachedNotebooks(): NotebookCache[];
export interface SourceCache {
    id: string;
    notebook_id: string;
    title?: string;
    type?: string;
    content?: string;
    metadata?: string;
    cached_at: number;
}
export declare function cacheSource(source: SourceCache): void;
export declare function getCachedSources(notebookId: string): SourceCache[];
export declare function getCachedSource(notebookId: string, sourceId: string): SourceCache | undefined;
//# sourceMappingURL=db.d.ts.map