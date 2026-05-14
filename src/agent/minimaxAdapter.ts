import type { IngestedFile } from "./fileIngestion";

export type MiniMaxRole = "system" | "user" | "assistant" | "tool";

export interface MiniMaxMessage {
  role: MiniMaxRole;
  content: string;
}

export interface MiniMaxContextSource {
  id: string;
  label: string;
  type: "task" | "session" | "issue" | "network" | "console" | "terminal" | "settings" | "architecture" | "file";
  summary: string;
}

export interface MiniMaxAdapterOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /**
   * Test/dev escape hatch. Mock completions are only allowed when an API key is present,
   * so a missing key still behaves like AI is unavailable.
   */
  mock?: boolean;
}

export interface MiniMaxCompletionRequest {
  messages: MiniMaxMessage[];
  contextSources?: MiniMaxContextSource[];
  files?: IngestedFile[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface MiniMaxCompletionResponse {
  id: string;
  model: string;
  content: string;
  usedMock: boolean;
  createdAt: string;
  inspectedSources: string[];
  fileIds: string[];
}

export class MiniMaxUnavailableError extends Error {
  constructor() {
    super("MiniMax API key is not configured on the server. Set MINIMAX_API_KEY on the backend to enable AI features.");
    this.name = "MiniMaxUnavailableError";
  }
}

const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";

export interface MiniMaxAdapter {
  readonly configured: boolean;
  readonly model: string;
  readonly baseUrl: string;
  readonly unavailableReason?: string;
  complete(request: MiniMaxCompletionRequest): Promise<MiniMaxCompletionResponse>;
}

const DEFAULT_MODEL = "minimax-text-01";
const DEFAULT_BASE_URL = "https://api.minimax.io/v1";

export function createMiniMaxAdapter(options: MiniMaxAdapterOptions = {}): MiniMaxAdapter {
  let apiKey: string | undefined;
  let configured: boolean;

  if (options.apiKey !== undefined) {
    apiKey = normalizeApiKey(options.apiKey);
    configured = Boolean(apiKey);
  } else if (IS_BROWSER) {
    apiKey = undefined;
    configured = readEnv("VITE_PLAYLENS_AI_ENABLED") === "true";
  } else {
    apiKey = normalizeApiKey(readEnv("MINIMAX_API_KEY"));
    configured = Boolean(apiKey);
  }

  const model = options.model ?? readEnv("VITE_MINIMAX_MODEL", "MINIMAX_MODEL") ?? DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? readEnv("VITE_MINIMAX_BASE_URL", "MINIMAX_BASE_URL") ?? DEFAULT_BASE_URL;
  const mock = options.mock ?? false;

  return {
    configured,
    model,
    baseUrl,
    unavailableReason: configured ? undefined : "MiniMax API key is missing.",
    async complete(request: MiniMaxCompletionRequest): Promise<MiniMaxCompletionResponse> {
      if (request.signal?.aborted) {
        throw new DOMException("MiniMax request was aborted.", "AbortError");
      }

      if (!configured) {
        throw new MiniMaxUnavailableError();
      }

      if (mock) {
        await wait(180, request.signal);
        return createMockResponse(model, request);
      }

      if (IS_BROWSER && !apiKey) {
        return requestViaProxy({ model, request });
      }

      return requestMiniMaxCompletion({ apiKey: apiKey!, model, baseUrl, request });
    },
  };
}

export const minimaxAdapter = createMiniMaxAdapter();

export function hasMiniMaxApiKey(): boolean {
  if (IS_BROWSER) {
    return readEnv("VITE_PLAYLENS_AI_ENABLED") === "true";
  }
  return Boolean(normalizeApiKey(readEnv("MINIMAX_API_KEY")));
}

function createMockResponse(model: string, request: MiniMaxCompletionRequest): MiniMaxCompletionResponse {
  const latestUserMessage = [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "Analyze the current run.";
  const sources = request.contextSources ?? [];
  const files = request.files ?? [];
  const sourceSummary = sources.length
    ? sources.slice(0, 4).map((source) => `- **${source.label}**: ${source.summary}`).join("\n")
    : "- **Current task**: Sample failure context from timeline, network, console, terminal, settings, and architecture metadata.";
  const fileSummary = files.length
    ? files.map((file) => `- [${file.name}](playlens://file/${file.id}) - ${file.summary}`).join("\n")
    : "- No uploaded files were included in this mock response.";

  return {
    id: `minimax-mock-${Date.now().toString(36)}`,
    model,
    usedMock: true,
    createdAt: new Date().toISOString(),
    inspectedSources: sources.map((source) => source.id),
    fileIds: files.map((file) => file.id),
    content: [
      "## Operator Analysis",
      "",
      `I received: **${latestUserMessage}**`,
      "",
      "### Evidence Reviewed",
      sourceSummary,
      "",
      "### Uploaded Files",
      fileSummary,
      "",
      "### Recommendation",
      "A MiniMax key is configured. This mock response is only used by tests or explicit development mode.",
      "",
      "> Suggested action: pin the payment failure, open the network waterfall around the failed request, and keep the agent in **Ask Before Acting** mode for destructive settings.",
    ].join("\n"),
  };
}

async function requestViaProxy(input: {
  model: string;
  request: MiniMaxCompletionRequest;
}): Promise<MiniMaxCompletionResponse> {
  const proxyBase = readEnv("VITE_PLAYLENS_API_BASE") ?? "http://127.0.0.1:4174";
  const response = await fetch(`${proxyBase}/api/ai/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: input.request.messages,
      temperature: input.request.temperature ?? 0.2,
      maxTokens: input.request.maxTokens ?? 1200,
    }),
    signal: input.request.signal,
  });

  if (!response.ok) {
    if (response.status === 503) throw new MiniMaxUnavailableError();
    const detail = await response.text().catch(() => "");
    throw new Error(`AI proxy error: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 240)}` : ""}`);
  }

  const json = (await response.json()) as {
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: string }; text?: string }>;
  };
  const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";

  return {
    id: json.id ?? `minimax-${Date.now().toString(36)}`,
    model: json.model ?? input.model,
    usedMock: false,
    createdAt: new Date().toISOString(),
    inspectedSources: input.request.contextSources?.map((source) => source.id) ?? [],
    fileIds: input.request.files?.map((file) => file.id) ?? [],
    content: content || "MiniMax returned an empty response.",
  };
}

async function requestMiniMaxCompletion(input: {
  apiKey: string;
  model: string;
  baseUrl: string;
  request: MiniMaxCompletionRequest;
}): Promise<MiniMaxCompletionResponse> {
  const response = await fetch(`${input.baseUrl.replace(/\/$/g, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.request.messages,
      temperature: input.request.temperature ?? 0.2,
      max_tokens: input.request.maxTokens ?? 1200,
    }),
    signal: input.request.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MiniMax request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 240)}` : ""}`);
  }

  const json = (await response.json()) as {
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: string }; text?: string }>;
  };
  const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";

  return {
    id: json.id ?? `minimax-${Date.now().toString(36)}`,
    model: json.model ?? input.model,
    usedMock: false,
    createdAt: new Date().toISOString(),
    inspectedSources: input.request.contextSources?.map((source) => source.id) ?? [],
    fileIds: input.request.files?.map((file) => file.id) ?? [],
    content: content || "MiniMax returned an empty response.",
  };
}

function readEnv(...names: string[]): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;

  for (const name of names) {
    const value = viteEnv?.[name] ?? processEnv?.[name];
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeApiKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function wait(duration: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("MiniMax request was aborted.", "AbortError"));
      return;
    }

    const timeout = globalThis.setTimeout(resolve, duration);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeout);
        reject(new DOMException("MiniMax request was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}
