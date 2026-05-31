import { redactSecrets } from "../core/redact.js";

export type ProviderErrorCategory =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "bad_response"
  | "provider_unavailable"
  | "aborted";

export class ProviderError extends Error {
  readonly name = "ProviderError";

  constructor(
    readonly category: ProviderErrorCategory,
    message: string,
    readonly details: { status?: number; requestId?: string; retryable?: boolean } = {}
  ) {
    super(redactSecrets(message));
  }
}
