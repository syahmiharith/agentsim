import { getLiveModelConfig } from "../config.js";
import type { ModelProvider } from "../types.js";
import { ChatCompletionsCompatibleProvider } from "./chat-completions-compatible-provider.js";
import { MockModelProvider } from "./mock-model-provider.js";

export type ProviderSelection = "auto" | "mock" | "live";
export { ProviderError } from "./provider-error.js";
export type { ProviderErrorCategory } from "./provider-error.js";

export function createModelProvider(selection: ProviderSelection): ModelProvider {
  const liveConfig = getLiveModelConfig();
  const hasLiveConfig = Boolean(liveConfig.apiKey);

  if (selection === "mock") {
    return new MockModelProvider();
  }

  if (selection === "live") {
    if (!liveConfig.apiKey) {
      throw new Error("Live model mode requires AGENTSIM_MODEL_API_KEY, OPENAI_API_KEY, or OPENAI_COMPATIBLE_API_KEY.");
    }
    return createLiveProvider({ ...liveConfig, apiKey: liveConfig.apiKey });
  }

  if (hasLiveConfig && liveConfig.apiKey) {
    return createLiveProvider({ ...liveConfig, apiKey: liveConfig.apiKey });
  }

  return new MockModelProvider();
}

function createLiveProvider(config: ReturnType<typeof getLiveModelConfig> & { apiKey: string }): ModelProvider {
  switch (config.providerKind) {
    case "chat-completions-compatible":
      return new ChatCompletionsCompatibleProvider(config);
    default:
      return unreachableProviderKind(config.providerKind);
  }
}

function unreachableProviderKind(providerKind: never): never {
  throw new Error(`Unsupported model provider: ${providerKind}`);
}
