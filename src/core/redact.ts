const SECRET_ASSIGNMENT = /(["']?(?:api[_-]?key|apikey|token|secret|password|openai_api_key)["']?\s*[:=]\s*["']?)([^"',}\s]+)/gi;
const BEARER_TOKEN = /(bearer\s+)[a-z0-9._\-~+/]+=*/gi;
const OPENAI_KEY = /\bsk-[a-zA-Z0-9_-]{12,}\b/g;
const SECRET_KEY = /api[_-]?key|apikey|token|secret|password|authorization/i;

export function redactSecrets(input: string): string {
  return input
    .replace(BEARER_TOKEN, "$1[REDACTED]")
    .replace(OPENAI_KEY, "[REDACTED]")
    .replace(SECRET_ASSIGNMENT, "$1[REDACTED]");
}

export function redactRecord<T extends Record<string, unknown>>(record: T): T {
  return redactValue(record) as T;
}

function redactValue(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, entryKey)]));
  }

  return value;
}
