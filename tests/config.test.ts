import { afterEach, describe, expect, it } from "vitest";
import { getLiveModelConfig } from "../src/config.js";

const keys = [
  "AGENTSIM_MODEL_API_KEY",
  "AGENTSIM_MODEL_BASE_URL",
  "AGENTSIM_MODEL_MAX_RETRIES",
  "AGENTSIM_MODEL_MAX_TOKENS",
  "AGENTSIM_MODEL_NAME",
  "AGENTSIM_MODEL_PROVIDER",
  "AGENTSIM_MODEL_RETRY_BASE_DELAY_MS",
  "AGENTSIM_MODEL_TIMEOUT_MS",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OPENAI_COMPATIBLE_MODEL",
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
      model: "provider-model",
      requestTimeoutMs: 60_000,
      maxRetries: 2,
      retryBaseDelayMs: 500,
      maxTokens: undefined,
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
      model: "compatible-model",
      requestTimeoutMs: 60_000,
      maxRetries: 2,
      retryBaseDelayMs: 500,
      maxTokens: undefined,
    });
  });

  it("parses provider reliability controls", () => {
    process.env.AGENTSIM_MODEL_TIMEOUT_MS = "12000";
    process.env.AGENTSIM_MODEL_MAX_RETRIES = "4";
    process.env.AGENTSIM_MODEL_RETRY_BASE_DELAY_MS = "25";
    process.env.AGENTSIM_MODEL_MAX_TOKENS = "2048";

    expect(getLiveModelConfig()).toMatchObject({
      requestTimeoutMs: 12_000,
      maxRetries: 4,
      retryBaseDelayMs: 25,
      maxTokens: 2048,
    });
  });

  it("rejects unsupported provider registry entries", () => {
    process.env.AGENTSIM_MODEL_PROVIDER = "provider-sdk-runtime";

    expect(() => getLiveModelConfig()).toThrow("Unsupported AGENTSIM_MODEL_PROVIDER");
  });

  it("rejects invalid live provider base URLs", () => {
    process.env.AGENTSIM_MODEL_BASE_URL = "not a url";

    expect(() => getLiveModelConfig()).toThrow("valid URL");
  });

  it("rejects non-http live provider base URLs", () => {
    process.env.AGENTSIM_MODEL_BASE_URL = "file:///tmp/model";

    expect(() => getLiveModelConfig()).toThrow("http or https");
  });

  it("rejects blank live provider model names", () => {
    process.env.AGENTSIM_MODEL_NAME = "   ";

    expect(() => getLiveModelConfig()).toThrow("model name");
  });

  it("rejects invalid provider reliability controls", () => {
    process.env.AGENTSIM_MODEL_MAX_RETRIES = "-1";

    expect(() => getLiveModelConfig()).toThrow("AGENTSIM_MODEL_MAX_RETRIES");
  });
});
