import { afterEach, describe, expect, it } from "vitest";
import { createModelProvider } from "../src/providers/index.js";

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

describe("model provider factory", () => {
  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it("keeps auto mode deterministic without BYOK config", () => {
    expect(createModelProvider("auto").name).toBe("deterministic-mock");
  });

  it("requires a key only for explicit live mode", () => {
    expect(() => createModelProvider("live")).toThrow("AGENTSIM_MODEL_API_KEY");
  });

  it("creates the configured provider registry adapter for live mode", () => {
    process.env.AGENTSIM_MODEL_API_KEY = "test-key";
    process.env.AGENTSIM_MODEL_BASE_URL = "https://models.example.test/v1";
    process.env.AGENTSIM_MODEL_NAME = "provider-model";

    const provider = createModelProvider("live");

    expect(provider.mode).toBe("live");
    expect(provider.name).toBe("chat-completions-compatible");
  });
});
