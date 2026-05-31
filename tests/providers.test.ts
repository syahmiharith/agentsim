import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatCompletionsCompatibleProvider } from "../src/providers/chat-completions-compatible-provider.js";
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
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
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

  it("passes abort signals into live provider fetch calls", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null = null;
    globalThis.fetch = vi.fn(async (_url, init) => {
      receivedSignal = init?.signal as AbortSignal;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider({
      providerKind: "chat-completions-compatible",
      baseUrl: "https://models.example.test/v1",
      model: "provider-model",
      apiKey: "test-key"
    });

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test",
      abortSignal: controller.signal
    })).resolves.toMatchObject({ content: "ok", model: "provider-model" });

    expect(receivedSignal).toBe(controller.signal);
  });

  it("rejects aborted live provider requests without exposing the API key", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider({
      providerKind: "chat-completions-compatible",
      baseUrl: "https://models.example.test/v1",
      model: "provider-model",
      apiKey: "sk-testsecret1234567890"
    });

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test",
      abortSignal: controller.signal
    })).rejects.not.toThrow("sk-testsecret");
  });
});
