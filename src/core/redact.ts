const SECRET_ASSIGNMENT =
  /(["']?(?:api[_-]?key|apikey|access[_-]?key|secret[_-]?access[_-]?key|token|secret|password|client[_-]?secret|private[_-]?key|openai[_-]?api[_-]?key|anthropic[_-]?api[_-]?key|github[_-]?token|aws[_-]?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token))["']?\s*[:=]\s*["']?)([^"',}\s]+)/gi;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_TOKEN = /(bearer\s+)[a-z0-9._\-~+/]+=*/gi;
const OPENAI_KEY = /\bsk-[a-zA-Z0-9_-]{12,}\b/g;
const ANTHROPIC_KEY = /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g;
const GITHUB_TOKEN = /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{20,}\b|\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g;
const AWS_ACCESS_KEY_ID = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const SECRET_KEY = /api[_-]?key|apikey|access[_-]?key|token|secret|password|authorization|credential|private[_-]?key/i;

export function redactSecrets(input: string): string {
  return input
    .replace(PRIVATE_KEY_BLOCK, "[REDACTED]")
    .replace(BEARER_TOKEN, "$1[REDACTED]")
    .replace(ANTHROPIC_KEY, "[REDACTED]")
    .replace(OPENAI_KEY, "[REDACTED]")
    .replace(GITHUB_TOKEN, "[REDACTED]")
    .replace(AWS_ACCESS_KEY_ID, "[REDACTED]")
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
