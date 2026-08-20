import PlatformSettingModel from "../../db/models/platformSetting.model.js";

export type AiProviderKey = "groq" | "iti-bedrock" | "student-bedrock";

export interface EffectiveAiRuntimeConfig {
  provider: AiProviderKey;
  chatModel: string;
  embeddingModel: string;
  temperature: number;
  maxOutputTokens: number;
  source: "environment" | "database";
  checkedAt: string;
}

const DEFAULT_CONFIG: EffectiveAiRuntimeConfig = {
  provider: resolveProviderFromEnv(),
  chatModel: resolveChatModelFromEnv(resolveProviderFromEnv()),
  embeddingModel: resolveEmbeddingModelFromEnv(resolveProviderFromEnv()),
  temperature: 0.2,
  maxOutputTokens: 2048,
  source: "environment",
  checkedAt: new Date().toISOString(),
};

let cache: EffectiveAiRuntimeConfig = DEFAULT_CONFIG;
let hydrated = false;

function resolveProviderFromEnv(): AiProviderKey {
  const primary = process.env.LLM_PRIMARY_PROVIDER?.trim().toLowerCase();
  if (primary === "groq" || primary === "iti-bedrock" || primary === "student-bedrock") {
    return primary;
  }
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  if (process.env.SBG_API_KEY?.trim()) return "student-bedrock";
  return "iti-bedrock";
}

function resolveChatModelFromEnv(provider: AiProviderKey): string {
  if (provider === "groq") return process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile";
  if (provider === "iti-bedrock") return process.env.ITI_BEDROCK_MODEL || "openai.gpt-oss-120b-1:0";
  return process.env.BEDROCK_CHAT_MODEL || "anthropic.claude-sonnet-4-6";
}

function resolveEmbeddingModelFromEnv(provider: AiProviderKey): string {
  if (provider === "groq") return process.env.JINA_EMBEDDING_MODEL || "jina-embeddings-v3";
  if (provider === "iti-bedrock") return process.env.BEDROCK_EMBEDDING_MODEL || "amazon.titan-embed-text-v2:0";
  return process.env.BEDROCK_EMBEDDING_MODELS?.split(",")[0]?.trim() || "amazon.titan-embed-text-v2:0";
}

function normalizeConfig(raw: Record<string, unknown>): EffectiveAiRuntimeConfig {
  const providerRaw = String(raw.provider ?? "").trim().toLowerCase();
  const provider: AiProviderKey =
    providerRaw === "groq" || providerRaw === "iti-bedrock" || providerRaw === "student-bedrock"
      ? providerRaw
      : DEFAULT_CONFIG.provider;
  const chatModel = typeof raw.chatModel === "string" && raw.chatModel.trim() ? raw.chatModel.trim() : resolveChatModelFromEnv(provider);
  const embeddingModel = typeof raw.embeddingModel === "string" && raw.embeddingModel.trim() ? raw.embeddingModel.trim() : resolveEmbeddingModelFromEnv(provider);
  const temperature = typeof raw.temperature === "number" && Number.isFinite(raw.temperature) ? Math.min(2, Math.max(0, raw.temperature)) : DEFAULT_CONFIG.temperature;
  const maxOutputTokens = typeof raw.maxOutputTokens === "number" && Number.isFinite(raw.maxOutputTokens) && Number.isInteger(raw.maxOutputTokens)
    ? Math.min(8192, Math.max(128, raw.maxOutputTokens))
    : DEFAULT_CONFIG.maxOutputTokens;
  return {
    provider,
    chatModel,
    embeddingModel,
    temperature,
    maxOutputTokens,
    source: "database",
    checkedAt: new Date().toISOString(),
  };
}

export async function primeEffectiveAiRuntimeConfig(): Promise<EffectiveAiRuntimeConfig> {
  if (hydrated) return cache;
  try {
    const doc = await PlatformSettingModel.findOne({ key: "ai_configuration" }).lean().exec();
    if (doc?.value && typeof doc.value === "object") {
      cache = normalizeConfig(doc.value as Record<string, unknown>);
    }
  } catch {
    // Fall back to environment defaults; runtime consumers still have a safe
    // configuration while the database is unavailable.
  }
  hydrated = true;
  return cache;
}

export function getEffectiveAiRuntimeConfig(): EffectiveAiRuntimeConfig {
  return cache;
}

export function updateEffectiveAiRuntimeConfig(raw: Record<string, unknown>): EffectiveAiRuntimeConfig {
  cache = normalizeConfig(raw);
  hydrated = true;
  return cache;
}

export function resetEffectiveAiRuntimeConfigForTests(): void {
  cache = DEFAULT_CONFIG;
  hydrated = false;
}
