import { describe, expect, it } from "vitest";
import { renderGeneratedAppTestReport, runGeneratedAppExecutionChecks } from "../src/core/generated-app-execution.js";
import { resolveCommandPolicy } from "../src/core/command-policy.js";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import type { RunCommandInput, Workspace, WorkspaceDriver } from "../src/types.js";

describe("generated app execution checks", () => {
  it("skips command checks when command execution is not enabled", async () => {
    const report = await runGeneratedAppExecutionChecks({
      workspace: fakeWorkspace(),
      workspaceDriver: fakeDriver(),
      commandPolicy: resolveCommandPolicy("dev"),
      allowCommands: false,
      appSpec: fakeAppSpec(),
    });

    expect(report.ok).toBe(true);
    expect(report.commandExecutionEnabled).toBe(false);
    expect(report.checks.every((check) => check.status === "skipped")).toBe(true);
    expect(report.acceptanceScenarios.every((scenario) => scenario.status === "skipped")).toBe(true);
    expect(renderGeneratedAppTestReport(report)).toContain("Command execution: disabled");
    expect(renderGeneratedAppTestReport(report)).toContain("## Acceptance Scenarios");
  });

  it("runs allowed checks and skips build when install fails", async () => {
    const calls: RunCommandInput[] = [];
    const driver = fakeDriver(async (_workspace, input) => {
      calls.push(input);
      if (input.command === "pnpm" && input.args?.[0] === "install") {
        throw new Error("Command failed with exit code 1: pnpm");
      }
      return {
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 12,
      };
    });

    const report = await runGeneratedAppExecutionChecks({
      workspace: fakeWorkspace(),
      workspaceDriver: driver,
      commandPolicy: resolveCommandPolicy("dev"),
      allowCommands: true,
      appSpec: fakeAppSpec(),
    });

    expect(calls.map((call) => [call.command, call.args?.join(" ")])).toEqual([
      ["node", "--check server.js"],
      ["pnpm", "install"],
    ]);
    expect(report.ok).toBe(false);
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ["node-check", "passed"],
      ["install", "failed"],
      ["build", "skipped"],
      ["api-smoke", "skipped"],
    ]);
  });

  it("runs the API smoke command after a successful build", async () => {
    const calls: RunCommandInput[] = [];
    const driver = fakeDriver(async (_workspace, input) => {
      calls.push(input);
      return {
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 12,
      };
    });

    const report = await runGeneratedAppExecutionChecks({
      workspace: fakeWorkspace(),
      workspaceDriver: driver,
      commandPolicy: resolveCommandPolicy("dev"),
      allowCommands: true,
      appSpec: fakeAppSpec(),
    });

    expect(calls.map((call) => [call.command, call.args?.[0]])).toEqual([
      ["node", "--check"],
      ["pnpm", "install"],
      ["pnpm", "build"],
      ["node", "-e"],
    ]);
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ["node-check", "passed"],
      ["install", "passed"],
      ["build", "passed"],
      ["api-smoke", "passed"],
    ]);
    expect(report.checks.find((check) => check.id === "api-smoke")?.label).toBe("API boot and smoke test");
    expect(report.acceptanceScenarios.every((scenario) => scenario.status === "passed")).toBe(true);
  });
});

function fakeWorkspace(): Workspace {
  return {
    runId: "execution-test",
    rootDir: "C:/tmp/execution-test",
    workspaceDir: "C:/tmp/execution-test/workspace",
    finalPackageDir: "C:/tmp/execution-test/final-package",
  };
}

function fakeDriver(runCommand?: WorkspaceDriver["runCommand"]): WorkspaceDriver {
  return {
    create: async () => fakeWorkspace(),
    writeFile: async () => "",
    readFile: async () => "",
    listFiles: async () => [],
    copyDirectory: async () => undefined,
    runCommand:
      runCommand ??
      (async (_workspace, input) => ({
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        exitCode: 0,
        stdout: "",
        stderr: "",
      })),
  };
}

function fakeAppSpec() {
  return appSpecFromDomainSpec(inferDomainSpec("Build an inventory request system for a flower company"));
}
