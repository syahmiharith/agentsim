import type { LiveModelConfig } from "../config.js";
import { redactSecrets } from "../core/redact.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../types.js";
import { ProviderError, type ProviderErrorCategory } from "./provider-error.js";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface NormalizedLiveModelConfig extends LiveModelConfig {
  apiKey: string;
}

export class ChatCompletionsCompatibleProvider implements ModelProvider {
  readonly mode = "live";
  readonly name = "chat-completions-compatible";
  private readonly config: NormalizedLiveModelConfig;

  constructor(config: LiveModelConfig & { apiKey: string }) {
    this.config = {
      ...config,
      requestTimeoutMs: config.requestTimeoutMs ?? 60_000,
      maxRetries: config.maxRetries ?? 2,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 500
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (request.abortSignal?.aborted) {
      throw new ProviderError("aborted", "Model request aborted before provider call.", { retryable: false });
    }

    let attempt = 0;
    while (true) {
      try {
        return await this.generateOnce(request);
      } catch (error) {
        const providerError = normalizeProviderError(error);
        if (!shouldRetryProviderError(providerError, attempt, this.config.maxRetries, request.abortSignal)) {
          throw providerError;
        }
        await sleep(backoffDelay(this.config.retryBaseDelayMs, attempt), request.abortSignal);
        attempt += 1;
      }
    }
  }

  private async generateOnce(request: ModelRequest): Promise<ModelResponse> {
    const timeout = createTimeoutSignal(this.config.requestTimeoutMs);
    const signal = anySignal([request.abortSignal, timeout.signal]);
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt }
          ],
          temperature: 0.2,
          ...(this.config.maxTokens ? { max_tokens: this.config.maxTokens } : {})
        })
      });

      const requestId = providerRequestId(response);
      const text = await response.text();
      const body = response.ok ? parseProviderJson(text, response.status, requestId) : parseOptionalProviderJson(text);
      if (!response.ok) {
        throw providerHttpError(response.status, body, text, requestId);
      }

      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new ProviderError("bad_response", "Model response did not include content.", {
          status: response.status,
          requestId,
          retryable: false
        });
      }

      return { content, model: this.config.model, providerRequestId: requestId };
    } catch (error) {
      if (request.abortSignal?.aborted) {
        throw new ProviderError("aborted", "Model request aborted.", { retryable: false });
      }
      if (timeout.signal.aborted) {
        throw new ProviderError("timeout", `Model request timed out after ${this.config.requestTimeoutMs}ms.`, { retryable: false });
      }
      throw error;
    } finally {
      timeout.clear();
    }
  }
}

function providerHttpError(status: number, body: ChatCompletionResponse, text: string, requestId?: string): ProviderError {
  const category = categoryForStatus(status);
  const fallback = text.trim() ? redactSecrets(text.trim().slice(0, 500)) : `Model request failed with HTTP ${status}`;
  const message = body.error?.message ?? fallback;
  return new ProviderError(category, message, {
    status,
    requestId,
    retryable: category === "rate_limit" || category === "provider_unavailable"
  });
}

function categoryForStatus(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 500) {
    return "provider_unavailable";
  }
  return "bad_response";
}

function parseProviderJson(text: string, status: number, requestId?: string): ChatCompletionResponse {
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new ProviderError("bad_response", `Model provider returned non-JSON response with HTTP ${status}.`, {
      status,
      requestId,
      retryable: false
    });
  }
}

function parseOptionalProviderJson(text: string): ChatCompletionResponse {
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch {
    return {};
  }
}

function providerRequestId(response: Response): string | undefined {
  return response.headers.get("x-request-id") ??
    response.headers.get("x-openai-request-id") ??
    response.headers.get("cf-ray") ??
    undefined;
}

function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }
  if (isAbortError(error)) {
    return new ProviderError("aborted", "Model request aborted.", { retryable: false });
  }
  const message = error instanceof Error ? error.message : "Model provider request failed.";
  return new ProviderError("provider_unavailable", message, { retryable: true });
}

function shouldRetryProviderError(error: ProviderError, attempt: number, maxRetries: number, signal?: AbortSignal): boolean {
  return !signal?.aborted &&
    Boolean(error.details.retryable) &&
    attempt < maxRetries &&
    (error.category === "rate_limit" || error.category === "provider_unavailable");
}

function backoffDelay(baseDelayMs: number, attempt: number): number {
  return baseDelayMs * (2 ** attempt);
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    }
  };
}

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 1) {
    return activeSignals[0];
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderError("aborted", "Model request aborted during provider retry backoff.", { retryable: false }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new ProviderError("aborted", "Model request aborted during provider retry backoff.", { retryable: false }));
    }, { once: true });
  });
}
