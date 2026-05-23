import type { IngestedFile } from "./fileIngestion";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface AIMessage {
  role: MessageRole;
  content: string;
}

export interface AIContextSource {
  id: string;
  label: string;
  type: "task" | "session" | "issue" | "network" | "console" | "terminal" | "settings" | "architecture" | "file";
  summary: string;
}

export type AIProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "groq"
  | "minimax"
  | "moonshot";

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
}

export const SUPPORTED_MODELS: AIModel[] = [
  // OpenAI
  { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", provider: "openai" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  // Anthropic
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  // Google
  { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "google" },
  { id: "gemini-3-flash", name: "Gemini 3 Flash", provider: "google" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google" },
  // Groq (Llama)
  { id: "llama-4-maverick", name: "Llama 4 Maverick", provider: "groq" },
  { id: "llama-4-scout", name: "Llama 4 Scout", provider: "groq" },
  { id: "llama-3.3-70b", name: "Llama 3.3 70B", provider: "groq" },
  // MiniMax
  { id: "minimax-m2.7", name: "MiniMax M2.7", provider: "minimax" },
  { id: "minimax-m2.5-lightning", name: "MiniMax M2.5 Lightning", provider: "minimax" },
  // Moonshot/Kimi
  { id: "kimi-latest", name: "Kimi Latest", provider: "moonshot" },
  { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", provider: "moonshot" },
  { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo", provider: "moonshot" },
  { id: "kimi-k2.5-vision", name: "Kimi K2.5 Vision", provider: "moonshot" },
  { id: "moonshot-v1-128k", name: "Moonshot V1 128K", provider: "moonshot" },
];

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  minimax: "MiniMax",
  moonshot: "Moonshot",
};

export interface AIAdapterOptions {
  apiKey?: string;
  model?: string;
  provider?: AIProvider;
  baseUrl?: string;
  mock?: boolean;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  contextSources?: AIContextSource[];
  files?: IngestedFile[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AICompletionResponse {
  id: string;
  model: string;
  content: string;
  usedMock: boolean;
  createdAt: string;
  inspectedSources: string[];
  fileIds: string[];
}

export class AIUnavailableError extends Error {
  constructor(reason?: string) {
    super(reason ?? "AI is not configured. Set an API key on the backend to enable AI features.");
    this.name = "AIUnavailableError";
  }
}

const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";

export interface AIAdapter {
  readonly configured: boolean;
  readonly model: string;
  readonly provider: AIProvider;
  readonly unavailableReason?: string;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

export function createAIAdapter(options: AIAdapterOptions = {}): AIAdapter {
  let configured: boolean;

  if (IS_BROWSER) {
    configured = readEnv("VITE_PLAYLENS_AI_ENABLED") === "true";
  } else {
    const hasAnyKey = Boolean(
      normalizeValue(readEnv("OPENAI_API_KEY")) ??
      normalizeValue(readEnv("ANTHROPIC_API_KEY")) ??
      normalizeValue(readEnv("GOOGLE_API_KEY")) ??
      normalizeValue(readEnv("GROQ_API_KEY")) ??
      normalizeValue(readEnv("MINIMAX_API_KEY")) ??
      normalizeValue(readEnv("MOONSHOT_API_KEY")) ??
      normalizeValue(options.apiKey),
    );
    configured = hasAnyKey;
  }

  const model = options.model ?? readEnv("VITE_PLAYLENS_AI_MODEL", "AI_MODEL") ?? "gpt-4o";
  const provider = options.provider ?? detectProvider(model);
  const mock = options.mock ?? false;

  return {
    configured,
    model,
    provider,
    unavailableReason: configured ? undefined : "No AI provider API key is configured.",
    async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
      if (request.signal?.aborted) {
        throw new DOMException("AI request was aborted.", "AbortError");
      }

      if (!configured) {
        throw new AIUnavailableError();
      }

      if (mock) {
        await wait(180, request.signal);
        return createMockResponse(model, request);
      }

      return requestViaProxy({ model, provider, request });
    },
  };
}

export function detectProvider(modelId: string): AIProvider {
  if (modelId.startsWith("gpt-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("llama-")) return "groq";
  if (modelId.startsWith("minimax-")) return "minimax";
  if (modelId.startsWith("kimi-") || modelId.startsWith("moonshot-")) return "moonshot";
  return "openai";
}

export function hasAIApiKey(): boolean {
  if (IS_BROWSER) {
    return readEnv("VITE_PLAYLENS_AI_ENABLED") === "true";
  }
  return Boolean(
    normalizeValue(readEnv("OPENAI_API_KEY")) ??
    normalizeValue(readEnv("ANTHROPIC_API_KEY")) ??
    normalizeValue(readEnv("GOOGLE_API_KEY")) ??
    normalizeValue(readEnv("GROQ_API_KEY")) ??
    normalizeValue(readEnv("MINIMAX_API_KEY")) ??
    normalizeValue(readEnv("MOONSHOT_API_KEY")),
  );
}

function createMockResponse(model: string, request: AICompletionRequest): AICompletionResponse {
  const latestUserMessage = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "Analyze the current run.";
  const sources = request.contextSources ?? [];
  const files = request.files ?? [];
  const sourceSummary = sources.length
    ? sources.slice(0, 4).map((s) => `- **${s.label}**: ${s.summary}`).join("\n")
    : "- **Current task**: Sample failure context from timeline, network, console, terminal, settings, and architecture metadata.";
  const fileSummary = files.length
    ? files.map((f) => `- [${f.name}](playlens://file/${f.id}) - ${f.summary}`).join("\n")
    : "- No uploaded files were included in this mock response.";

  return {
    id: `ai-mock-${Date.now().toString(36)}`,
    model,
    usedMock: true,
    createdAt: new Date().toISOString(),
    inspectedSources: sources.map((s) => s.id),
    fileIds: files.map((f) => f.id),
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
      "An API key is configured. This mock response is only used by tests or explicit development mode.",
      "",
      "> Suggested action: pin the failure, open the network waterfall around the failed request, and keep the agent in **Ask Before Acting** mode for destructive settings.",
    ].join("\n"),
  };
}

async function requestViaProxy(input: {
  model: string;
  provider: AIProvider;
  request: AICompletionRequest;
}): Promise<AICompletionResponse> {
  const proxyBase = readEnv("VITE_PLAYLENS_API_BASE") ?? "http://127.0.0.1:4174";
  const response = await fetch(`${proxyBase}/api/ai/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      provider: input.provider,
      messages: input.request.messages,
      temperature: input.request.temperature ?? 0.2,
      maxTokens: input.request.maxTokens ?? 1200,
    }),
    signal: input.request.signal,
  });

  if (!response.ok) {
    if (response.status === 503) throw new AIUnavailableError();
    const detail = await response.text().catch(() => "");
    throw new Error(`AI proxy error: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 240)}` : ""}`);
  }

  const json = (await response.json()) as {
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    content?: Array<{ text?: string }>;
  };

  let content: string;
  if (json.choices?.[0]?.message?.content) {
    content = json.choices[0].message.content;
  } else if (json.choices?.[0]?.text) {
    content = json.choices[0].text;
  } else if (json.content?.[0]?.text) {
    content = json.content[0].text;
  } else {
    content = "";
  }

  return {
    id: json.id ?? `ai-${Date.now().toString(36)}`,
    model: json.model ?? input.model,
    usedMock: false,
    createdAt: new Date().toISOString(),
    inspectedSources: input.request.contextSources?.map((s) => s.id) ?? [],
    fileIds: input.request.files?.map((f) => f.id) ?? [],
    content: content || "AI returned an empty response.",
  };
}

function readEnv(...names: string[]): string | undefined {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const processEnv = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;

  for (const name of names) {
    const value = viteEnv?.[name] ?? processEnv?.[name];
    if (value) return value;
  }
  return undefined;
}

function normalizeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function wait(duration: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("AI request was aborted.", "AbortError"));
      return;
    }
    const timeout = globalThis.setTimeout(resolve, duration);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("AI request was aborted.", "AbortError"));
    }, { once: true });
  });
}
