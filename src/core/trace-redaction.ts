import { sep } from "node:path";
import type { Workspace } from "../types.js";

export interface TraceRedactionInput {
  workspace?: Workspace;
  repoRoot?: string;
  extraPaths?: string[];
}

interface Replacement {
  value: string;
  replacement: string;
}

export function redactTraceValue<T>(value: T, input: TraceRedactionInput): T {
  const replacements = createPathReplacements(input);
  return redactValue(value, replacements) as T;
}

export function createPathReplacements(input: TraceRedactionInput): Replacement[] {
  const pairs: Array<[string | undefined, string]> = [
    [input.workspace?.finalPackageDir, "<final-package>"],
    [input.workspace?.workspaceDir, "<workspace>"],
    [input.workspace?.rootDir, "<run-root>"],
    [input.repoRoot, "<repo>"],
    ...((input.extraPaths ?? []).map((path) => [path, "<local-path>"] as [string | undefined, string]))
  ];
  const seen = new Set<string>();
  const replacements: Replacement[] = [];
  for (const [path, replacement] of pairs) {
    if (!path) {
      continue;
    }
    for (const value of pathVariants(path)) {
      if (value.length === 0 || seen.has(value)) {
        continue;
      }
      seen.add(value);
      replacements.push({ value, replacement });
    }
  }
  return replacements.sort((left, right) => right.value.length - left.value.length);
}

function redactValue(value: unknown, replacements: Replacement[]): unknown {
  if (typeof value === "string") {
    return replacements.reduce((current, replacement) => current.split(replacement.value).join(replacement.replacement), value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactValue(entry, replacements)]));
  }
  return value;
}

function pathVariants(path: string): string[] {
  const normalized = path.replaceAll("\\", "/");
  const native = sep === "\\" ? normalized.replaceAll("/", "\\") : path;
  return [path, normalized, native];
}
