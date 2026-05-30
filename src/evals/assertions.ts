import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { FieldSpec } from "../domain/domain-spec.js";
import type { EvalCommandExpectation, EvalFailure } from "./types.js";

const outputCap = 4096;

export async function assertFileExists(rootDir: string, path: string, code = "file_missing"): Promise<EvalFailure[]> {
  const fullPath = safeResolve(rootDir, path);
  if (!fullPath) {
    return [failure(code, `Path escapes eval root: ${path}`, "error", path)];
  }
  try {
    const stats = await stat(fullPath);
    return stats.isFile() || stats.isDirectory()
      ? []
      : [failure(code, `Expected file or directory to exist: ${path}`, "error", path)];
  } catch {
    return [failure(code, `Expected file to exist: ${path}`, "error", path)];
  }
}

export async function assertFileContains(rootDir: string, path: string, terms: string[], code = "required_phrase_missing"): Promise<EvalFailure[]> {
  const text = await readText(rootDir, path);
  if (text === undefined) {
    return [failure("file_unreadable", `Could not read ${path}`, "error", path)];
  }
  return terms
    .filter((term) => !containsText(text, term))
    .map((term) => failure(code, `Expected ${path} to contain ${term}`, "error", path, term));
}

export async function assertFileNotContains(rootDir: string, path: string, terms: string[], code = "forbidden_phrase_present"): Promise<EvalFailure[]> {
  const text = await readText(rootDir, path);
  if (text === undefined) {
    return [];
  }
  return terms
    .filter((term) => containsText(text, term))
    .map((term) => failure(code, `Expected ${path} not to contain ${term}`, "error", path, `not ${term}`, term));
}

export function assertJsonPathEquals(json: unknown, path: string, expected: unknown, code = "json_path_mismatch"): EvalFailure[] {
  const actual = resolveDotPath(json, path);
  return deepEqual(actual, expected)
    ? []
    : [failure(code, `Expected JSON path ${path} to equal ${String(expected)}`, "error", path, expected, actual)];
}

export function assertJsonPathIncludes(json: unknown, path: string, expected: unknown, code = "json_path_missing_value"): EvalFailure[] {
  const actual = resolveDotPath(json, path);
  if (!Array.isArray(actual)) {
    return [failure(code, `Expected JSON path ${path} to be an array containing ${String(expected)}`, "error", path, expected, actual)];
  }
  return actual.some((item) => deepEqual(item, expected))
    ? []
    : [failure(code, `Expected JSON path ${path} to include ${String(expected)}`, "error", path, expected, actual)];
}

export async function assertRequiredArtifacts(rootDir: string, paths: string[]): Promise<EvalFailure[]> {
  const results = await Promise.all(paths.map((path) => assertFileExists(rootDir, path, artifactCode(path))));
  return results.flat();
}

export async function assertTraceCompleteness(rootDir: string, paths: string[]): Promise<EvalFailure[]> {
  const required = paths.length > 0 ? paths : defaultTraceFiles;
  const results = await Promise.all(required.map((path) => assertFileExists(rootDir, path, "trace_file_missing")));
  return results.flat();
}

export async function assertContextEvalOk(rootDir: string): Promise<EvalFailure[]> {
  const contextEval = await readJsonFile<{ evaluation?: { requiredCoverageOk?: boolean; provenanceOk?: boolean; failures?: string[] } }>(rootDir, "trace/context-eval.json");
  if (!contextEval?.evaluation) {
    return [failure("context_eval_missing", "Missing context evaluation trace.", "error", "trace/context-eval.json")];
  }
  const failures: EvalFailure[] = [];
  if (contextEval.evaluation.requiredCoverageOk !== true) {
    failures.push(failure("context_coverage_failed", "Context evaluation reports incomplete required coverage.", "error", "trace/context-eval.json", true, contextEval.evaluation.requiredCoverageOk));
  }
  if (contextEval.evaluation.provenanceOk !== true) {
    failures.push(failure("context_provenance_failed", "Context evaluation reports incomplete provenance.", "error", "trace/context-eval.json", true, contextEval.evaluation.provenanceOk));
  }
  for (const contextFailure of contextEval.evaluation.failures ?? []) {
    failures.push(failure("context_eval_failure", `Context evaluation failure: ${contextFailure}`, "error", "trace/context-eval.json"));
  }
  return failures;
}

export async function assertCommandPasses(rootDir: string, commandCheck: EvalCommandExpectation): Promise<EvalFailure[]> {
  const severity = commandCheck.optional ? "warn" : "error";
  if (commandCheck.timeoutMs <= 0 || commandCheck.timeoutMs > 120_000) {
    return [failure("command_timeout_invalid", `Command timeout must be between 1ms and 120000ms: ${commandCheck.command}`, severity, commandCheck.cwd)];
  }
  const cwd = safeResolve(rootDir, commandCheck.cwd);
  if (!cwd) {
    return [failure("command_cwd_escape", `Command cwd escapes eval root: ${commandCheck.cwd}`, severity, commandCheck.cwd)];
  }
  const parsed = tokenizeCommand(commandCheck.command);
  if (!parsed.ok) {
    return [failure("command_unsupported_syntax", parsed.error, severity, commandCheck.cwd, "simple command argv", commandCheck.command)];
  }
  if (parsed.argv.length === 0) {
    return [failure("command_empty", "Command must not be empty.", severity, commandCheck.cwd)];
  }
  const result = await runBoundedCommand(parsed.argv, cwd, commandCheck.timeoutMs);
  if (result.exitCode === 0 && !result.timedOut) {
    return [];
  }
  return [failure(
    "command_failed",
    `Command failed: ${commandCheck.command}`,
    severity,
    commandCheck.cwd,
    0,
    { exitCode: result.exitCode, timedOut: result.timedOut, output: result.output }
  )];
}

export async function assertGeneratedApiBehavior(rootDir: string, entitySlug: string, statuses: string[]): Promise<EvalFailure[]> {
  const failures: EvalFailure[] = [];
  const serverPath = "app/server.js";
  const serverSource = await readText(rootDir, serverPath);
  if (serverSource === undefined) {
    return [failure("api_server_missing", "Generated API server is missing.", "error", serverPath)];
  }
  if (!serverSource.includes("/api/health")) {
    failures.push(failure("api_health_missing", "Generated API server is missing the health route.", "error", serverPath, "/api/health"));
  }
  if (!serverSource.includes('"/api/" + config.entitySlug')) {
    failures.push(failure("api_list_missing", "Generated API server is missing the entity list route.", "error", serverPath, `/api/${entitySlug}`));
  }
  if (!serverSource.includes('request.method === "POST"') || !serverSource.includes("validate(body)")) {
    failures.push(failure("api_create_missing", "Generated API server is missing create route validation behavior.", "error", serverPath, "POST create with validate(body)"));
  }
  if (!serverSource.includes("/([^/]+)/status") || !serverSource.includes('request.method === "PATCH"')) {
    failures.push(failure("api_status_update_missing", "Generated API server is missing status update behavior.", "error", serverPath, `PATCH /api/${entitySlug}/:id/status`));
  }
  if (!serverSource.includes("field.required") || !serverSource.includes("is required")) {
    failures.push(failure("api_required_field_validation_missing", "Generated API server is missing required field validation.", "error", serverPath));
  }
  if (statuses.length > 0 && (!serverSource.includes("statuses.has(body.status)") || !serverSource.includes("Unknown status"))) {
    failures.push(failure("api_status_validation_missing", "Generated API server is missing status validation.", "error", serverPath, statuses));
  }

  const seedPath = `app/data/${entitySlug}.json`;
  const seedText = await readText(rootDir, seedPath);
  if (seedText === undefined) {
    failures.push(failure("seed_data_missing", `Generated seed data is missing: ${seedPath}`, "error", seedPath));
    return failures;
  }
  try {
    JSON.parse(seedText);
  } catch (error) {
    failures.push(failure("seed_data_invalid", `Generated seed data is not valid JSON: ${seedPath}`, "error", seedPath, "valid JSON", error instanceof Error ? error.message : String(error)));
  }
  return failures;
}

export async function assertGeneratedApiRuntimeBehavior(rootDir: string, entitySlug: string, statuses: string[], fields: FieldSpec[] = []): Promise<EvalFailure[]> {
  const appDir = safeResolve(rootDir, "app");
  if (!appDir) {
    return [failure("api_runtime_app_path_invalid", "Generated app path escapes eval root.", "error", "app")];
  }
  const serverSource = await readText(rootDir, "app/server.js");
  if (serverSource === undefined) {
    return [failure("api_runtime_server_missing", "Generated API server is missing.", "error", "app/server.js")];
  }

  const port = await getOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: appDir,
    shell: false,
    windowsHide: true,
    env: {
      PATH: process.env.PATH ?? "",
      Path: process.env.Path ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      TEMP: process.env.TEMP ?? "",
      TMP: process.env.TMP ?? "",
      CI: process.env.CI ?? "1",
      NODE_ENV: "test",
      PORT: String(port)
    }
  });

  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString("utf8")}`.slice(0, outputCap);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString("utf8")}`.slice(0, outputCap);
  });

  try {
    await waitForHealth(baseUrl);
    const health = await fetchJson(`${baseUrl}/api/health`);
    if (health.status !== 200 || health.body?.ok !== true) {
      return [failure("api_runtime_health_failed", "Generated API health route did not return ok.", "error", "app/server.js", { ok: true }, health.body)];
    }

    const listBefore = await fetchJson(`${baseUrl}/api/${entitySlug}`);
    if (listBefore.status !== 200 || !Array.isArray(listBefore.body?.[entitySlug])) {
      return [failure("api_runtime_list_failed", "Generated API list route did not return the entity collection.", "error", "app/server.js")];
    }

    const createResponse = await fetchJson(`${baseUrl}/api/${entitySlug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createRuntimeRecord(fields))
    });
    if (createResponse.status !== 201) {
      return [failure("api_runtime_create_failed", "Generated API create route did not accept a valid record.", "error", "app/server.js", 201, createResponse)];
    }

    const listAfter = await fetchJson(`${baseUrl}/api/${entitySlug}`);
    const records = listAfter.body?.[entitySlug];
    if (listAfter.status !== 200 || !Array.isArray(records) || records.length === 0 || typeof records[0]?.id !== "string") {
      return [failure("api_runtime_created_record_missing", "Generated API did not return a created record with an id.", "error", "app/server.js")];
    }

    const nextStatus = statuses[1] ?? statuses[0] ?? records[0].status;
    const patchResponse = await fetchJson(`${baseUrl}/api/${entitySlug}/${records[0].id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (patchResponse.status !== 200) {
      return [failure("api_runtime_status_update_failed", "Generated API status update route did not accept a valid status.", "error", "app/server.js", 200, patchResponse)];
    }

    return [];
  } catch (error) {
    return [failure("api_runtime_failed", "Generated API runtime behavior check failed.", "error", "app/server.js", undefined, error instanceof Error ? error.message : String(error))];
  } finally {
    await stopChild(child);
  }
}

export function resolveDotPath(value: unknown, path: string): unknown {
  if (path.trim() === "") {
    return value;
  }
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    if (typeof current === "object" && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

export async function readJsonFile<T>(rootDir: string, path: string): Promise<T | undefined> {
  const text = await readText(rootDir, path);
  if (text === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export async function readText(rootDir: string, path: string): Promise<string | undefined> {
  const fullPath = safeResolve(rootDir, path);
  if (!fullPath) {
    return undefined;
  }
  try {
    return await readFile(fullPath, "utf8");
  } catch {
    return undefined;
  }
}

export function safeResolve(rootDir: string, path: string): string | undefined {
  if (isAbsolute(path)) {
    return undefined;
  }
  const root = resolve(rootDir);
  const fullPath = resolve(join(root, path));
  const relativePath = relative(root, fullPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath)) ? fullPath : undefined;
}

function artifactCode(path: string): string {
  return path.startsWith("trace/") ? "trace_file_missing" : "final_package_file_missing";
}

function failure(code: string, message: string, severity: EvalFailure["severity"], path?: string, expected?: unknown, actual?: unknown): EvalFailure {
  return { code, message, severity, path, expected, actual };
}

function containsText(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tokenizeCommand(command: string): { ok: true; argv: string[] } | { ok: false; error: string } {
  const argv: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        argv.push(current);
        current = "";
      }
      continue;
    }
    if (char === "$" && command[index + 1] === "(") {
      return { ok: false, error: "Command contains unsupported shell substitution syntax." };
    }
    if (/[;&|<>`]/.test(char)) {
      return { ok: false, error: `Command contains unsupported shell operator: ${char}` };
    }
    current += char;
  }

  if (quote) {
    return { ok: false, error: "Command contains an unterminated quoted argument." };
  }
  if (current.length > 0) {
    argv.push(current);
  }
  return { ok: true, argv };
}

async function runBoundedCommand(argv: string[], cwd: string, timeoutMs: number): Promise<{ exitCode: number | null; timedOut: boolean; output: string }> {
  return await new Promise((resolvePromise) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        PATH: process.env.PATH ?? "",
        Path: process.env.Path ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        TEMP: process.env.TEMP ?? "",
        TMP: process.env.TMP ?? "",
        CI: process.env.CI ?? "1",
        NODE_ENV: "test"
      }
    });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      resolvePromise({ exitCode: null, timedOut: true, output: output.slice(0, outputCap) });
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(0, outputCap);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(0, outputCap);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode: null, timedOut: false, output: error.message.slice(0, outputCap) });
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise({ exitCode, timedOut: false, output: output.slice(0, outputCap) });
    });
  });
}

async function getOpenPort(): Promise<number> {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolvePort(port);
        } else {
          rejectPort(new Error("Could not allocate a local port."));
        }
      });
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for generated API health route: ${lastError instanceof Error ? lastError.message : "no response"}`);
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body?: Record<string, any> }> {
  const response = await fetch(url, init);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as Record<string, any> : undefined
  };
}

function createRuntimeRecord(fields: FieldSpec[]): Record<string, string | number> {
  return Object.fromEntries(fields.map((field) => [field.name, runtimeValueForField(field)]));
}

function runtimeValueForField(field: FieldSpec): string | number {
  if (field.type === "number") {
    return 1;
  }
  if (field.type === "select") {
    return field.options?.[0] ?? "";
  }
  if (field.type === "date") {
    return "2026-06-01";
  }
  if (field.type === "datetime") {
    return "2026-06-01T10:00";
  }
  return `Runtime ${field.label}`;
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  await new Promise<void>((resolveStop) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveStop();
    }, 1_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    child.kill();
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

const defaultTraceFiles = [
  "trace/events.jsonl",
  "trace/agent-messages.json",
  "trace/agent-actions.json",
  "trace/context-packages.json",
  "trace/context-eval.json",
  "trace/approvals.json",
  "trace/decisions.json",
  "trace/domain-spec.json",
  "trace/artifact-lineage.json",
  "trace/run-summary.json"
];
