import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatCompletionsCompatibleProvider } from "../src/providers/chat-completions-compatible-provider.js";
import { createModelProvider } from "../src/providers/index.js";
import { ProviderError } from "../src/providers/provider-error.js";

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
    const received: { signal?: AbortSignal } = {};
    globalThis.fetch = vi.fn(async (_url, init) => {
      received.signal = init?.signal as AbortSignal;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      providerKind: "chat-completions-compatible",
      baseUrl: "https://models.example.test/v1",
      model: "provider-model",
      apiKey: "test-key"
    }));

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test",
      abortSignal: controller.signal
    })).resolves.toMatchObject({ content: "ok", model: "provider-model" });

    if (!received.signal) {
      throw new Error("Expected fetch to receive an abort signal.");
    }
    const signal = received.signal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("rejects aborted live provider requests without exposing the API key", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch = vi.fn(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      providerKind: "chat-completions-compatible",
      baseUrl: "https://models.example.test/v1",
      model: "provider-model",
      apiKey: "sk-testsecret1234567890"
    }));

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test",
      abortSignal: controller.signal
    })).rejects.not.toThrow("sk-testsecret");
  });

  it("retries retryable provider failures and returns provider request ids", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "x-request-id": "req-123" }
      }));
    globalThis.fetch = fetchMock as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      apiKey: "test-key",
      maxRetries: 1,
      retryBaseDelayMs: 0
    }));

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test"
    })).resolves.toMatchObject({ content: "ok", providerRequestId: "req-123" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies non-json provider failures without leaking secrets", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("provider unavailable for sk-testsecret1234567890", { status: 503 })
    ) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      apiKey: "sk-testsecret1234567890",
      maxRetries: 0
    }));

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test"
    })).rejects.toMatchObject({
      category: "provider_unavailable",
      details: { status: 503, retryable: true }
    });
    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test"
    })).rejects.not.toThrow("sk-testsecret");
  });

  it("classifies auth failures as non-retryable provider errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })
    );
    globalThis.fetch = fetchMock as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      apiKey: "test-key",
      maxRetries: 3,
      retryBaseDelayMs: 0
    }));

    const request = provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test"
    });

    await expect(request).rejects.toBeInstanceOf(ProviderError);
    await expect(request).rejects.toMatchObject({
      category: "auth",
      details: { status: 401, retryable: false }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts live provider requests on configured timeout", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      }, { once: true });
    })) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      apiKey: "test-key",
      requestTimeoutMs: 5,
      maxRetries: 0
    }));

    await expect(provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test"
    })).rejects.toMatchObject({ category: "timeout" });
  });

  it("passes max token configuration to chat completion requests", async () => {
    let body: { max_tokens?: number } | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    const provider = new ChatCompletionsCompatibleProvider(providerConfig({
      apiKey: "test-key",
      maxTokens: 512
    }));

    await provider.generate({
      system: "system",
      prompt: "prompt",
      purpose: "test"
    });

    expect(body?.max_tokens).toBe(512);
  });
});

function providerConfig(overrides: Partial<ConstructorParameters<typeof ChatCompletionsCompatibleProvider>[0]> = {}): ConstructorParameters<typeof ChatCompletionsCompatibleProvider>[0] {
  return {
    providerKind: "chat-completions-compatible",
    baseUrl: "https://models.example.test/v1",
    model: "provider-model",
    apiKey: "test-key",
    requestTimeoutMs: 60_000,
    maxRetries: 2,
    retryBaseDelayMs: 500,
    ...overrides
  };
}
