import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assembleContextPackage, defaultContextPolicyForStep, validateContextPackage } from "../src/core/context.js";
import { sha256 } from "../src/core/hash.js";
import { LocalContextPackagesRepo } from "../src/core/repositories.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import type { AgentMessageRecord, AgentStep, Artifact, ContextPackage, ContextPolicy, Task } from "../src/types.js";

describe("ContextPackage", () => {
  it("creates deterministic hashes, persists packages, and redacts secrets", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-context-test-"));
    const artifactPath = join(runRoot, "workspace", "requirements.md");
    await mkdir(join(runRoot, "workspace"), { recursive: true });
    await writeFile(artifactPath, "# Requirements\n\nUse the intake form.", "utf8");

    const artifact: Artifact = {
      id: "artifact-requirements",
      type: "requirements",
      ownerAgentId: "scope-pm",
      status: "approved",
      workspacePath: artifactPath,
      finalPackagePath: "planning/requirements.md",
      lineage: { inputArtifactIds: [] },
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      reviewStatus: "not_required",
      approvalStatus: "approved",
      contentHash: sha256("# Requirements\n\nUse the intake form.")
    };
    const step = testStep();
    const task = testTask(step);
    const message = testMessage(step);
    const domainSpec = softwareFreelancePack.inferDomainSpec("Build an inventory request system for sk-testsecret1234567890");

    const first = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for sk-testsecret1234567890",
      task,
      step,
      domainSpec,
      artifactsByType: { requirements: artifact },
      messages: [message],
      decisions: [],
      approvals: []
    });
    const second = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for sk-testsecret1234567890",
      task,
      step,
      domainSpec,
      artifactsByType: { requirements: artifact },
      messages: [message],
      decisions: [],
      approvals: []
    });

    expect(first.contextHash).toBe(second.contextHash);
    expect(validateContextPackage(first).ok).toBe(true);
    expect(first.items.every((item) => item.contentHash === sha256(item.content))).toBe(true);
    expect(JSON.stringify(first)).not.toContain("sk-testsecret1234567890");
    expect(JSON.stringify(first)).toContain("[REDACTED]");

    const repo = new LocalContextPackagesRepo(runRoot);
    await repo.createContextPackage(first);
    expect(await repo.listContextPackagesByRun()).toEqual([first]);
    expect(await readFile(join(runRoot, "state", "context-packages.json"), "utf8")).toContain(first.id);
  });

  it("reports required kind and size validation failures", async () => {
    const step = testStep();
    const policy: ContextPolicy = {
      ...defaultContextPolicyForStep(step),
      requiredKinds: ["user_goal", "artifact"],
      maxCharsPerItem: 10,
      maxTotalChars: 10
    };
    const pkg: ContextPackage = {
      id: "ctx-invalid",
      runId: "context-run",
      taskId: "technical-architecture",
      agentId: "software-architect",
      stepId: "technical-architecture",
      goal: "goal",
      objective: "design architecture",
      inputArtifactIds: ["artifact-requirements"],
      messageIds: [],
      itemIds: ["user_goal-context-run"],
      items: [{
        id: "user_goal-context-run",
        runId: "context-run",
        kind: "user_goal",
        source: "user.goal",
        sourceId: "context-run",
        content: "this content is too long",
        contentHash: sha256("this content is too long"),
        createdAt: "2026-05-30T00:00:00.000Z",
        sensitivity: "internal"
      }],
      policy,
      contextHash: "tampered",
      createdAt: "2026-05-30T00:00:00.000Z"
    };

    const result = validateContextPackage(pkg);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      "Context package ctx-invalid is missing required kind artifact",
      "Context package ctx-invalid exceeds maxTotalChars",
      "Context item user_goal-context-run exceeds maxCharsPerItem",
      "Context package ctx-invalid contextHash does not match content"
    ]));
  });
});

function testStep(): AgentStep {
  return {
    id: "technical-architecture",
    ownerAgentId: "software-architect",
    action: "design technical architecture",
    outputType: "architecture",
    requiredInputs: ["requirements"],
    reviewRequired: false,
    async execute() {
      throw new Error("test helper step should not execute");
    }
  };
}

function testTask(step: AgentStep): Task {
  return {
    id: step.id,
    runId: "context-run",
    title: "Design technical architecture",
    description: "Create the architecture artifact",
    kind: "artifact_generation",
    assignedAgentId: step.ownerAgentId,
    status: "ready",
    dependsOn: [],
    requiredArtifactTypes: step.requiredInputs,
    outputArtifactType: step.outputType,
    attempts: 0,
    maxAttempts: 2,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z"
  };
}

function testMessage(step: AgentStep): AgentMessageRecord {
  return {
    id: "message-architecture",
    runId: "context-run",
    type: "artifact.handoff",
    from: "scope-pm",
    to: step.ownerAgentId,
    stepId: step.id,
    artifactId: "artifact-requirements",
    artifactType: "requirements",
    question: "Use requirements to design architecture.",
    expectedOutput: "Architecture artifact",
    createdAt: "2026-05-30T00:00:00.000Z"
  };
}
