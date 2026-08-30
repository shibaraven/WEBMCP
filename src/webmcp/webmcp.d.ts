interface WebMcpToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

interface WebMcpRegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: WebMcpToolAnnotations;
}

interface WebMcpTool extends WebMcpRegisteredTool {
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown | Promise<unknown>;
}

interface WebMcpModelContext {
  registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal; exposedTo?: string[] }) => void | Promise<void>;
  getTools: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredTool[]>;
}

interface Document {
  modelContext?: WebMcpModelContext;
}
