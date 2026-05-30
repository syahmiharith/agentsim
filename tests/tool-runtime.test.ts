import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileArtifactStore } from "../src/core/artifacts.js";
import { JsonlEventStore } from "../src/core/events.js";
import { LocalArtifactsRepo, LocalApprovalsRepo } from "../src/core/repositories.js";
import { createToolRuntime } from "../src/core/tool-runtime.js";
import { ToolApprovalRequiredError } from "../src/core/tools.js";
import { LocalFilesystemWorkspaceDriver } from "../src/core/workspace.js";
import type { ToolContext } from "../src/types.js";

describe("tool runtime", () => {
  it("writes files and emits tool.called events from real execution context", async () => {
    const context = await createRuntimeContext("tool-write");
    const tools = createToolRuntime(context);

    await tools.writeFile({ path: "notes/output.md", content: "hello" });

    expect(await context.workspaceDriver.readFile(context.workspace, "notes/output.md")).toBe("hello");
    const events = await readFile(context.eventsPath, "utf8");
    expect(events).toContain("tool.called");
    expect(events).toContain("write_file");
  });

  it("creates artifacts through the active store and repository", async () => {
    const context = await createRuntimeContext("tool-artifact");
    const tools = createToolRuntime(context);

    const result = await tools.createArtifact({
      type: "requirements",
      ownerAgentId: "scope-pm",
      content: "requirements",
      workspaceRelativePath: "artifacts/requirements.md",
      finalPackagePath: "planning/requirements.md",
      status: "approved",
      reviewStatus: "not_required",
      approvalStatus: "approved"
    });

    expect(context.artifactStore.list().map((artifact) => artifact.id)).toContain(result.id);
    expect((await context.artifactsRepo.listArtifactsByRun()).map((artifact) => artifact.id)).toContain(result.id);
  });

  it("pauses dangerous tools through the approval path", async () => {
    const context = await createRuntimeContext("tool-approval");
    const tools = createToolRuntime(context);

    await expect(tools.runCommand({ command: "node", args: ["--version"] })).rejects.toBeInstanceOf(ToolApprovalRequiredError);
    const approvals = await context.approvalsRepo.listApprovalsByRun();
    expect(approvals[0]).toMatchObject({ status: "pending", action: "node --version" });
  });
});

async function createRuntimeContext(runId: string) {
  const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-tool-runtime-"));
  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(runId, outputRoot);
  const eventsPath = join(workspace.rootDir, "state", "events.jsonl");
  const artifactsRepo = new LocalArtifactsRepo(workspace.rootDir);
  const approvalsRepo = new LocalApprovalsRepo(workspace.rootDir);
  const artifactStore = new FileArtifactStore(workspace);

  return {
    runId,
    workspace,
    workspaceDriver: driver,
    eventStore: new JsonlEventStore(runId, eventsPath),
    eventsPath,
    artifactStore,
    artifactsRepo,
    approvalsRepo,
    modelMode: "mock" as const,
    allowCommands: false,
    requestApproval: (approval: Parameters<NonNullable<ToolContext["requestApproval"]>>[0]) =>
      approvalsRepo.createApproval({ ...approval, runId, notes: approval.notes ?? "approval requested" })
  };
}
