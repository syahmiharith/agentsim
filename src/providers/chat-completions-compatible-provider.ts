import type { LiveModelConfig } from "../config.js";
import { redactSecrets } from "../core/redact.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../types.js";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class ChatCompletionsCompatibleProvider implements ModelProvider {
  readonly mode = "live";
  readonly name = "chat-completions-compatible";

  constructor(private readonly config: Required<LiveModelConfig>) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
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
        temperature: 0.2
      })
    });

    const body = (await response.json()) as ChatCompletionResponse;
    if (!response.ok) {
      const message = body.error?.message ?? `Model request failed with HTTP ${response.status}`;
      throw new Error(redactSecrets(message));
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Model response did not include content.");
    }

    return { content, model: this.config.model };
  }
}
