import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface LiveModelConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
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
  return {
    apiKey: process.env.OPENAI_API_KEY ?? process.env.OPENAI_COMPATIBLE_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? process.env.OPENAI_COMPATIBLE_MODEL ?? "gpt-4.1-mini"
  };
}

