import { getLiveModelConfig } from "../config.js";
import type { ModelProvider } from "../types.js";
import { MockModelProvider } from "./mock-model-provider.js";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

export type ProviderSelection = "auto" | "mock" | "live";

export function createModelProvider(selection: ProviderSelection): ModelProvider {
  const liveConfig = getLiveModelConfig();
  const hasLiveConfig = Boolean(liveConfig.apiKey);

  if (selection === "mock") {
    return new MockModelProvider();
  }

  if (selection === "live") {
    if (!liveConfig.apiKey) {
      throw new Error("Live model mode requires OPENAI_API_KEY or OPENAI_COMPATIBLE_API_KEY.");
    }
    return new OpenAICompatibleProvider({ ...liveConfig, apiKey: liveConfig.apiKey });
  }

  if (hasLiveConfig && liveConfig.apiKey) {
    return new OpenAICompatibleProvider({ ...liveConfig, apiKey: liveConfig.apiKey });
  }

  return new MockModelProvider();
}

