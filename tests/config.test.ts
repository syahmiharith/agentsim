import { afterEach, describe, expect, it } from "vitest";
import { getLiveModelConfig } from "../src/config.js";

const keys = [
  "AGENTSIM_MODEL_API_KEY",
  "AGENTSIM_MODEL_BASE_URL",
  "AGENTSIM_MODEL_NAME",
  "AGENTSIM_MODEL_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_MODEL"
];

describe("live model config", () => {
  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it("prefers provider-neutral Agentsim model environment variables", () => {
    process.env.AGENTSIM_MODEL_API_KEY = "generic-key";
    process.env.AGENTSIM_MODEL_BASE_URL = "https://models.example.test/v1";
    process.env.AGENTSIM_MODEL_NAME = "provider-model";
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_MODEL = "openai-model";

    expect(getLiveModelConfig()).toEqual({
      providerKind: "chat-completions-compatible",
      apiKey: "generic-key",
      baseUrl: "https://models.example.test/v1",
      model: "provider-model"
    });
  });

  it("keeps OpenAI-compatible aliases for existing local env files", () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = "compatible-key";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://compatible.example.test/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "compatible-model";

    expect(getLiveModelConfig()).toEqual({
      providerKind: "chat-completions-compatible",
      apiKey: "compatible-key",
      baseUrl: "https://compatible.example.test/v1",
      model: "compatible-model"
    });
  });

  it("rejects unsupported provider registry entries", () => {
    process.env.AGENTSIM_MODEL_PROVIDER = "provider-sdk-runtime";

    expect(() => getLiveModelConfig()).toThrow("Unsupported AGENTSIM_MODEL_PROVIDER");
  });
});
