import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type LiveModelProviderKind = "chat-completions-compatible";

export interface LiveModelConfig {
  providerKind: LiveModelProviderKind;
  apiKey?: string;
  baseUrl: string;
  model: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  maxTokens?: number;
}

export function loadDotEnv(cwd = process.cwd()): void {
  const envPath = resolve(cwd, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

export function getLiveModelConfig(): LiveModelConfig {
  const baseUrl = process.env.AGENTSIM_MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.AGENTSIM_MODEL_NAME ?? process.env.OPENAI_MODEL ?? process.env.OPENAI_COMPATIBLE_MODEL ?? "gpt-4.1-mini";

  return {
    providerKind: parseProviderKind(process.env.AGENTSIM_MODEL_PROVIDER),
    apiKey: process.env.AGENTSIM_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENAI_COMPATIBLE_API_KEY,
    baseUrl: validateBaseUrl(baseUrl),
    model: validateModelName(model),
    requestTimeoutMs: readIntegerEnv("AGENTSIM_MODEL_TIMEOUT_MS", 60_000, { min: 1 }),
    maxRetries: readIntegerEnv("AGENTSIM_MODEL_MAX_RETRIES", 2, { min: 0 }),
    retryBaseDelayMs: readIntegerEnv("AGENTSIM_MODEL_RETRY_BASE_DELAY_MS", 500, { min: 0 }),
    maxTokens: readOptionalIntegerEnv("AGENTSIM_MODEL_MAX_TOKENS", { min: 1 }),
  };
}

function parseProviderKind(value: string | undefined): LiveModelProviderKind {
  if (!value || value === "chat-completions-compatible") {
    return "chat-completions-compatible";
  }

  throw new Error(`Unsupported AGENTSIM_MODEL_PROVIDER: ${value}`);
}

function validateBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Live model base URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Live model base URL must use http or https.");
  }

  return value;
}

function validateModelName(value: string): string {
  if (value.trim().length === 0) {
    throw new Error("Live model name must not be empty.");
  }

  return value;
}

function readIntegerEnv(key: string, defaultValue: number, options: { min: number }): number {
  const value = process.env[key];
  if (value === undefined || value.trim().length === 0) {
    return defaultValue;
  }
  return parseIntegerConfig(key, value, options);
}

function readOptionalIntegerEnv(key: string, options: { min: number }): number | undefined {
  const value = process.env[key];
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return parseIntegerConfig(key, value, options);
}

function parseIntegerConfig(key: string, value: string, options: { min: number }): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < options.min) {
    throw new Error(`${key} must be an integer greater than or equal to ${options.min}.`);
  }
  return parsed;
}
