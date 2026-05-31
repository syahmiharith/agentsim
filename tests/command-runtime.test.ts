import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCommandPolicy } from "../src/core/command-policy.js";
import { LocalFilesystemWorkspaceDriver } from "../src/core/workspace.js";

describe("safe command execution", () => {
  it("rejects disallowed commands and cwd escapes", async () => {
    const { driver, workspace } = await createWorkspace("command-reject");

    await expect(driver.runCommand(workspace, { command: "git", args: ["status"] })).rejects.toThrow("Command is not allowed");
    await expect(driver.runCommand(workspace, { command: "node", args: ["--version"], cwd: "../" })).rejects.toThrow("Command cwd must stay inside workspace");
    await expect(driver.runCommand(workspace, { command: "node", args: ["-e", "console.log('blocked')"] })).rejects.toThrow("strict policy");
  });

  it("runs allowlisted commands, caps output, filters env, and writes traces", async () => {
    const { driver, workspace } = await createWorkspace("command-allow");
    const previous = process.env.AGENTSIM_MODEL_API_KEY;
    process.env.AGENTSIM_MODEL_API_KEY = "sk-testsecret1234567890";

    try {
      const result = await driver.runCommand(workspace, {
        command: "node",
        args: ["-e", "console.log((process.env.AGENTSIM_MODEL_API_KEY || 'missing') + ':' + 'x'.repeat(200))"],
        maxOutputBytes: 40,
        commandPolicy: resolveCommandPolicy("unsafe-local")
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("missing");
      expect(result.stdout).not.toContain("sk-testsecret");
      expect(result.stdout).toContain("[truncated]");

      const stateTrace = await readFile(join(workspace.rootDir, "state", "command-results.jsonl"), "utf8");
      const packageTrace = await readFile(join(workspace.finalPackageDir, "trace", "command-results.jsonl"), "utf8");
      const stateRecord = JSON.parse(stateTrace.trim());
      const packageRecord = JSON.parse(packageTrace.trim());
      expect(stateTrace).toContain("\"command\":\"node\"");
      expect(packageTrace).toContain("\"command\":\"node\"");
      expect(stateRecord.cwd).toBe(workspace.workspaceDir);
      expect(packageRecord.cwd).toBe("<workspace>");
    } finally {
      if (previous === undefined) {
        delete process.env.AGENTSIM_MODEL_API_KEY;
      } else {
        process.env.AGENTSIM_MODEL_API_KEY = previous;
      }
    }
  });

  it("times out long-running commands and records the result", async () => {
    const { driver, workspace } = await createWorkspace("command-timeout");

    await expect(driver.runCommand(workspace, {
      command: "node",
      args: ["-e", "setTimeout(() => {}, 1000)"],
      timeoutMs: 10,
      commandPolicy: resolveCommandPolicy("unsafe-local")
    })).rejects.toThrow("Command failed with exit code 124");

    const stateTrace = await readFile(join(workspace.rootDir, "state", "command-results.jsonl"), "utf8");
    expect(stateTrace).toContain("\"timedOut\":true");
  });

  it("aborts running commands through the provided abort signal", async () => {
    const { driver, workspace } = await createWorkspace("command-abort");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);

    await expect(driver.runCommand(workspace, {
      command: "node",
      args: ["-e", "setTimeout(() => {}, 1000)"],
      timeoutMs: 1000,
      commandPolicy: resolveCommandPolicy("unsafe-local"),
      abortSignal: controller.signal
    })).rejects.toThrow("Command failed with exit code 124");

    const stateTrace = await readFile(join(workspace.rootDir, "state", "command-results.jsonl"), "utf8");
    expect(stateTrace).toContain("\"timedOut\":true");
    expect(stateTrace).not.toContain("\"exitCode\":0");
  });

  it("records nonzero process failures without reporting success", async () => {
    const { driver, workspace } = await createWorkspace("command-nonzero");

    await expect(driver.runCommand(workspace, {
      command: "node",
      args: ["-e", "process.exit(7)"],
      commandPolicy: resolveCommandPolicy("unsafe-local")
    })).rejects.toThrow("Command failed with exit code 7");

    const stateTrace = await readFile(join(workspace.rootDir, "state", "command-results.jsonl"), "utf8");
    expect(stateTrace).toContain("\"exitCode\":7");
    expect(stateTrace).not.toContain("\"exitCode\":0");
  });
});

async function createWorkspace(runId: string) {
  const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-command-test-"));
  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(runId, outputRoot);
  return { driver, workspace };
}
