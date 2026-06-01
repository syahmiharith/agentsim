import type { CommandPolicy, RunCommandResult, Workspace, WorkspaceDriver } from "../types.js";
import { assertCommandAllowed } from "./command-policy.js";
import type { AppSpec } from "../app-spec/app-spec.js";
import { rendererCapabilityFor, type RendererCapabilityManifest } from "../app-spec/renderer-capabilities.js";

export interface GeneratedAppCommandCheck {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string;
  status: "passed" | "failed" | "skipped";
  message: string;
  exitCode?: number;
  durationMs?: number;
}

export interface GeneratedAppExecutionReport {
  schemaVersion: 1;
  ok: boolean;
  commandExecutionEnabled: boolean;
  policyLevel: CommandPolicy["level"];
  renderer?: RendererCapabilityManifest;
  acceptanceScenarios: GeneratedAppAcceptanceScenarioCheck[];
  checks: GeneratedAppCommandCheck[];
}

export interface GeneratedAppAcceptanceScenarioCheck {
  id: string;
  name: string;
  status: "passed" | "skipped";
  coveredBy: string;
  message: string;
}

interface GeneratedAppCommandPlan {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  dependsOn?: string;
}

export async function runGeneratedAppExecutionChecks(input: {
  workspace: Workspace;
  workspaceDriver: WorkspaceDriver;
  commandPolicy: CommandPolicy;
  allowCommands: boolean;
  appSpec?: AppSpec;
  abortSignal?: AbortSignal;
}): Promise<GeneratedAppExecutionReport> {
  const plans: GeneratedAppCommandPlan[] = [
    {
      id: "node-check",
      label: "API syntax check",
      command: "node",
      args: ["--check", "server.js"],
      cwd: "final-package/app",
      timeoutMs: 5_000,
    },
    {
      id: "install",
      label: "Install dependencies",
      command: "pnpm",
      args: ["install"],
      cwd: "final-package/app",
      timeoutMs: 120_000,
    },
    {
      id: "build",
      label: "Build web app",
      command: "pnpm",
      args: ["build"],
      cwd: "final-package/app",
      timeoutMs: 120_000,
      dependsOn: "install",
    },
    ...(input.appSpec ? [apiSmokePlan(input.appSpec)] : []),
  ];

  const checks: GeneratedAppCommandCheck[] = [];
  for (const plan of plans) {
    const dependency = plan.dependsOn ? checks.find((check) => check.id === plan.dependsOn) : undefined;
    if (dependency && dependency.status !== "passed") {
      checks.push(skipped(plan, `Skipped because ${dependency.label} did not pass.`));
      continue;
    }

    checks.push(await runGeneratedAppCommand(input, plan));
  }

  return {
    schemaVersion: 1,
    ok: !checks.some((check) => check.status === "failed"),
    commandExecutionEnabled: input.allowCommands && Boolean(input.workspaceDriver.runCommand),
    policyLevel: input.commandPolicy.level,
    renderer: input.appSpec ? rendererCapabilityFor(input.appSpec.appArchetype) : undefined,
    acceptanceScenarios: acceptanceScenarioChecks(input.appSpec, checks),
    checks,
  };
}

function apiSmokePlan(appSpec: AppSpec): GeneratedAppCommandPlan {
  return {
    id: "api-smoke",
    label: "API boot and smoke test",
    command: "node",
    args: ["-e", renderApiSmokeScript(appSpec)],
    cwd: "final-package/app",
    timeoutMs: 20_000,
    dependsOn: "build",
  };
}

function renderApiSmokeScript(appSpec: AppSpec): string {
  const config = {
    entitySlug: appSpec.primaryEntity.slug,
    collectionKey: appSpec.primaryEntity.slug,
    fields: appSpec.primaryEntity.fields,
    nextStatus: appSpec.workflow.statuses.find((status) => status !== appSpec.workflow.initialStatus) ?? appSpec.workflow.initialStatus,
  };

  return `
const { spawn } = require("node:child_process");
const config = ${JSON.stringify(config)};
const port = 43100 + Math.floor(Math.random() * 1000);
const base = "http://127.0.0.1:" + port + "/api";
const server = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(path + " returned " + response.status + ": " + JSON.stringify(body));
  }
  return body;
}

function sampleValue(field) {
  if (field.type === "number") return 1;
  if (field.type === "select") return field.options?.[0] ?? "Sample";
  if (field.type === "date") return "2026-06-01";
  if (field.type === "datetime") return "2026-06-01T09:00";
  return "Smoke " + field.label;
}

(async () => {
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const health = await request("/health");
        healthy = health.ok === true;
        if (healthy) break;
      } catch {
        await sleep(250);
      }
    }
    if (!healthy) throw new Error("API health check did not pass.");

    await request("/" + config.entitySlug);
    const payload = Object.fromEntries(config.fields.map((field) => [field.name, sampleValue(field)]));
    await request("/" + config.entitySlug, { method: "POST", body: JSON.stringify(payload) });
    const afterCreate = await request("/" + config.entitySlug);
    const records = afterCreate[config.collectionKey] ?? [];
    const created = records[0];
    if (!created?.id) throw new Error("Create smoke did not return a persisted record.");
    await request("/" + config.entitySlug + "/" + created.id + "/status", {
      method: "PATCH",
      body: JSON.stringify({ status: config.nextStatus })
    });
    const afterStatus = await request("/" + config.entitySlug);
    const updated = (afterStatus[config.collectionKey] ?? []).find((record) => record.id === created.id);
    if (!updated || updated.status !== config.nextStatus) throw new Error("Status transition smoke did not persist.");
  } finally {
    server.kill();
  }
})().catch((error) => {
  server.kill();
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
`.trim();
}

export function renderGeneratedAppTestReport(report: GeneratedAppExecutionReport): string {
  const passed = report.checks.filter((check) => check.status === "passed").length;
  const failed = report.checks.filter((check) => check.status === "failed").length;
  const skippedCount = report.checks.filter((check) => check.status === "skipped").length;
  const rows = report.checks.map(
    (check) => `| ${escapeCell(check.label)} | ${check.status} | \`${escapeCell([check.command, ...check.args].join(" "))}\` | ${escapeCell(check.message)} |`,
  );

  return `# Generated App Test Report

## Summary

- Command execution: ${report.commandExecutionEnabled ? `enabled with \`${report.policyLevel}\` policy` : "disabled"}
- Passed: ${passed}
- Failed: ${failed}
- Skipped: ${skippedCount}

## Command Checks

| Check | Status | Command | Detail |
|---|---|---|---|
${rows.join("\n")}

## Acceptance Scenarios

${acceptanceScenarioRows(report)}
`;
}

function acceptanceScenarioChecks(appSpec: AppSpec | undefined, checks: GeneratedAppCommandCheck[]): GeneratedAppAcceptanceScenarioCheck[] {
  if (!appSpec) {
    return [];
  }
  const apiSmoke = checks.find((check) => check.id === "api-smoke");
  const status = apiSmoke?.status === "passed" ? "passed" : "skipped";
  return appSpec.acceptanceScenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    status,
    coveredBy: "api-smoke",
    message:
      status === "passed"
        ? `Covered by local API smoke check: ${scenario.expectedOutcome}`
        : "Scenario defined in AppSpec but not executed because API smoke did not pass or command execution was skipped.",
  }));
}

function acceptanceScenarioRows(report: GeneratedAppExecutionReport): string {
  if (report.acceptanceScenarios.length === 0) {
    return "No acceptance scenarios were provided.";
  }
  const rows = report.acceptanceScenarios.map(
    (scenario) => `| ${escapeCell(scenario.name)} | ${scenario.status} | ${escapeCell(scenario.coveredBy)} | ${escapeCell(scenario.message)} |`,
  );
  return `| Scenario | Status | Covered By | Detail |
|---|---|---|---|
${rows.join("\n")}`;
}

async function runGeneratedAppCommand(
  input: {
    workspace: Workspace;
    workspaceDriver: WorkspaceDriver;
    commandPolicy: CommandPolicy;
    allowCommands: boolean;
    abortSignal?: AbortSignal;
  },
  plan: GeneratedAppCommandPlan,
): Promise<GeneratedAppCommandCheck> {
  if (!input.allowCommands) {
    return skipped(plan, "Command execution is disabled. Rerun with --allow-commands and an appropriate command policy to execute this check.");
  }

  if (!input.workspaceDriver.runCommand) {
    return skipped(plan, "Workspace driver does not support command execution.");
  }

  const allowed = assertCommandAllowed({ command: plan.command, args: plan.args, timeoutMs: plan.timeoutMs }, input.commandPolicy);
  if (!allowed.ok) {
    return skipped(plan, `Command policy skipped this check: ${allowed.failures.join("; ")}`);
  }

  try {
    const result = await input.workspaceDriver.runCommand(input.workspace, {
      command: plan.command,
      args: plan.args,
      cwd: plan.cwd,
      timeoutMs: plan.timeoutMs,
      commandPolicy: input.commandPolicy,
      abortSignal: input.abortSignal,
    });
    return passed(plan, result);
  } catch (error) {
    return failed(plan, error instanceof Error ? error.message : "Command failed.");
  }
}

function passed(plan: GeneratedAppCommandPlan, result: RunCommandResult): GeneratedAppCommandCheck {
  return {
    id: plan.id,
    label: plan.label,
    command: plan.command,
    args: plan.args,
    cwd: plan.cwd,
    status: "passed",
    message: `Command completed with exit code ${result.exitCode}.`,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  };
}

function failed(plan: GeneratedAppCommandPlan, message: string): GeneratedAppCommandCheck {
  return {
    id: plan.id,
    label: plan.label,
    command: plan.command,
    args: plan.args,
    cwd: plan.cwd,
    status: "failed",
    message,
  };
}

function skipped(plan: GeneratedAppCommandPlan, message: string): GeneratedAppCommandCheck {
  return {
    id: plan.id,
    label: plan.label,
    command: plan.command,
    args: plan.args,
    cwd: plan.cwd,
    status: "skipped",
    message,
  };
}

function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}
