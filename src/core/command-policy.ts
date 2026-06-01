import type { CommandPolicy, CommandPolicyLevel, RunCommandInput, ValidationResult } from "../types.js";

const strictPolicy: CommandPolicy = {
  level: "strict",
  allowedCommands: ["node", "pnpm"],
  allowedArgPatterns: {
    node: ["^--version$", "^--check\\s+[^\\s]+$"],
    pnpm: ["^--version$"],
  },
  maxTimeoutMs: 30_000,
  maxOutputBytes: 64_000,
  allowNetwork: false,
};

const devPolicy: CommandPolicy = {
  level: "dev",
  allowedCommands: ["node", "pnpm"],
  allowedArgPatterns: {
    node: ["^--version$", "^--check\\s+[^\\s]+$", "^-e\\s+[\\s\\S]+$"],
    pnpm: ["^--version$", "^install$", "^build$", "^test$", "^typecheck$"],
  },
  maxTimeoutMs: 120_000,
  maxOutputBytes: 128_000,
  allowNetwork: false,
};

const unsafeLocalPolicy: CommandPolicy = {
  level: "unsafe-local",
  allowedCommands: ["node", "npm", "pnpm"],
  allowedArgPatterns: {
    node: [".*"],
    npm: [".*"],
    pnpm: [".*"],
  },
  maxTimeoutMs: 300_000,
  maxOutputBytes: 256_000,
  allowNetwork: true,
};

export function resolveCommandPolicy(level: CommandPolicyLevel = "strict"): CommandPolicy {
  if (level === "unsafe-local") {
    return clonePolicy(unsafeLocalPolicy);
  }
  if (level === "dev") {
    return clonePolicy(devPolicy);
  }
  return clonePolicy(strictPolicy);
}

export function assertCommandAllowed(input: RunCommandInput, policy: CommandPolicy): ValidationResult {
  const failures: string[] = [];
  if (!policy.allowedCommands.includes(input.command)) {
    failures.push(`Command is not allowed by ${policy.level} policy: ${input.command}`);
  }

  const argText = (input.args ?? []).join(" ");
  const patterns = policy.allowedArgPatterns[input.command] ?? [];
  if (patterns.length === 0 || !patterns.some((pattern) => new RegExp(pattern).test(argText))) {
    failures.push(`Command arguments are not allowed by ${policy.level} policy: ${input.command} ${argText}`.trim());
  }

  if ((input.timeoutMs ?? policy.maxTimeoutMs) > policy.maxTimeoutMs) {
    failures.push(`Command timeout exceeds ${policy.level} policy limit of ${policy.maxTimeoutMs}ms`);
  }
  if ((input.maxOutputBytes ?? policy.maxOutputBytes) > policy.maxOutputBytes) {
    failures.push(`Command output limit exceeds ${policy.level} policy limit of ${policy.maxOutputBytes} bytes`);
  }

  return { ok: failures.length === 0, failures };
}

function clonePolicy(policy: CommandPolicy): CommandPolicy {
  return {
    ...policy,
    allowedCommands: [...policy.allowedCommands],
    allowedArgPatterns: Object.fromEntries(Object.entries(policy.allowedArgPatterns).map(([command, patterns]) => [command, [...patterns]])),
  };
}
