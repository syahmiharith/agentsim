import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalCase, EvalSuite } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

export async function loadEvalCases(suite: EvalSuite | "all" = "smoke"): Promise<EvalCase[]> {
  const suites: EvalSuite[] = suite === "all" ? ["smoke", "domain"] : [suite];
  const cases = (await Promise.all(suites.map(loadSuiteCases))).flat();
  const seen = new Set<string>();
  for (const evalCase of cases) {
    if (seen.has(evalCase.id)) {
      throw new Error(`Duplicate eval case id: ${evalCase.id}`);
    }
    seen.add(evalCase.id);
  }
  return cases;
}

async function loadSuiteCases(suite: EvalSuite): Promise<EvalCase[]> {
  const path = join(here, "cases", `${suite}.json`);
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Eval suite ${suite} must be a JSON array.`);
  }
  return parsed.map((value, index) => normalizeCase(value, suite, index));
}

function normalizeCase(value: unknown, suite: EvalSuite, index: number): EvalCase {
  if (!isRecord(value)) {
    throw new Error(`Eval case ${suite}[${index}] must be an object.`);
  }
  const expected = value.expected;
  if (!isRecord(expected)) {
    throw new Error(`Eval case ${suite}[${index}] is missing expected object.`);
  }
  const evalCase: EvalCase = {
    id: readString(value, "id", suite, index),
    suite: readString(value, "suite", suite, index) as EvalSuite,
    difficulty: readString(value, "difficulty", suite, index) as EvalCase["difficulty"],
    prompt: readString(value, "prompt", suite, index),
    expected: {
      appName: readString(expected, "appName", suite, index),
      primaryEntity: readString(expected, "primaryEntity", suite, index),
      requiredFields: readStringArray(expected, "requiredFields", suite, index),
      requiredStatuses: readStringArray(expected, "requiredStatuses", suite, index),
      requiredArtifacts: readStringArray(expected, "requiredArtifacts", suite, index),
      requiredPhrases: readPhraseExpectations(expected.requiredPhrases, suite, index, "requiredPhrases"),
      forbiddenPhrases: readPhraseExpectations(expected.forbiddenPhrases, suite, index, "forbiddenPhrases"),
      commands: expected.commands === undefined ? undefined : readCommands(expected.commands, suite, index)
    }
  };
  if (evalCase.suite !== suite) {
    throw new Error(`Eval case ${evalCase.id} is in ${suite}.json but declares suite ${evalCase.suite}.`);
  }
  return evalCase;
}

function readPhraseExpectations(value: unknown, suite: string, index: number, key: string): EvalCase["expected"]["requiredPhrases"] {
  if (!Array.isArray(value)) {
    throw new Error(`Eval case ${suite}[${index}].expected.${key} must be an array.`);
  }
  return value.map((item, phraseIndex) => {
    if (!isRecord(item)) {
      throw new Error(`Eval case ${suite}[${index}].expected.${key}[${phraseIndex}] must be an object.`);
    }
    return {
      path: readString(item, "path", suite, index),
      terms: readStringArray(item, "terms", suite, index)
    };
  });
}

function readCommands(value: unknown, suite: string, index: number): NonNullable<EvalCase["expected"]["commands"]> {
  if (!Array.isArray(value)) {
    throw new Error(`Eval case ${suite}[${index}].expected.commands must be an array.`);
  }
  return value.map((item, commandIndex) => {
    if (!isRecord(item)) {
      throw new Error(`Eval case ${suite}[${index}].expected.commands[${commandIndex}] must be an object.`);
    }
    return {
      command: readString(item, "command", suite, index),
      cwd: readString(item, "cwd", suite, index),
      timeoutMs: readNumber(item, "timeoutMs", suite, index),
      optional: item.optional === undefined ? undefined : Boolean(item.optional)
    };
  });
}

function readString(record: Record<string, unknown>, key: string, suite: string, index: number): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Eval case ${suite}[${index}].${key} must be a non-empty string.`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string, suite: string, index: number): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Eval case ${suite}[${index}].${key} must be a finite number.`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string, suite: string, index: number): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`Eval case ${suite}[${index}].${key} must be a string array.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
