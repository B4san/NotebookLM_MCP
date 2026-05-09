/**
 * tools/handlers.ts
 *
 * Handlers para cada herramienta MCP expuesta.
 * Cada función retorna un objeto compatible con CallToolResult de MCP SDK.
 */
import type { NotebookLMBridge } from "../notebooklm/bridge.js";
type McpContent = {
    type: "text";
    text: string;
};
type ToolResult = {
    content: McpContent[];
};
export declare function handleListNotebooks(bridge: NotebookLMBridge): Promise<ToolResult>;
export declare function handleGetNotebook(bridge: NotebookLMBridge, args: {
    notebook_id: string;
}): Promise<ToolResult>;
export declare function handleListSources(bridge: NotebookLMBridge, args: {
    notebook_id: string;
}): Promise<ToolResult>;
export declare function handleGetSourceContent(bridge: NotebookLMBridge, args: {
    notebook_id: string;
    source_id: string;
}): Promise<ToolResult>;
export declare function handleSearchSources(bridge: NotebookLMBridge, args: {
    notebook_id: string;
    query: string;
}): Promise<ToolResult>;
export declare function handleAddSource(bridge: NotebookLMBridge, args: {
    notebook_id: string;
    source: string;
    source_type?: "url" | "file" | "text";
}): Promise<ToolResult>;
export declare function handleAskNotebook(bridge: NotebookLMBridge, args: {
    notebook_id: string;
    question: string;
}): Promise<ToolResult>;
export declare function handleListCliSessions(args: {
    tool?: string;
    limit?: number;
}): Promise<ToolResult>;
export declare function handleGetCliSession(args: {
    session_id: string;
}): Promise<ToolResult>;
export declare function handleSearchCliSessions(args: {
    query: string;
    tool?: string;
    limit?: number;
}): Promise<ToolResult>;
export declare function handleExportSessionToNotebook(bridge: NotebookLMBridge, args: {
    session_id: string;
    notebook_id: string;
}): Promise<ToolResult>;
export declare function handleGetActivityTimeline(args: {
    days?: number;
}): Promise<ToolResult>;
export {};
//# sourceMappingURL=handlers.d.ts.map