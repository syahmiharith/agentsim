import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assembleContextPackage, defaultContextPolicyForStep, evaluateContextPackages, renderModelPrompt, validateContextPackage } from "../src/core/context.js";
import { sha256 } from "../src/core/hash.js";
import { LocalContextPackagesRepo } from "../src/core/repositories.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import type { AgentActionRecord, AgentMessageRecord, AgentStep, Artifact, ContextPackage, ContextPolicy, Task } from "../src/types.js";

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

  it("includes required artifacts and excludes unrelated artifacts", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-context-inputs-"));
    const requirements = await createArtifact(runRoot, "requirements", "artifact-requirements", "# Requirements\n\nUse this.");
    const proposal = await createArtifact(runRoot, "proposal", "artifact-proposal", "# Proposal\n\nDo not include this.");
    const step = testStep();
    const pkg = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for a flower company",
      task: testTask(step),
      step,
      domainSpec: softwareFreelancePack.inferDomainSpec("Build an inventory request system for a flower company"),
      artifactsByType: { requirements, proposal },
      messages: [testMessage(step)],
      decisions: [],
      approvals: []
    });

    const artifactItems = pkg.items.filter((item) => item.kind === "artifact");
    expect(artifactItems.map((item) => item.sourceId)).toEqual(["artifact-requirements"]);
    expect(JSON.stringify(pkg)).not.toContain("Do not include this");
  });

  it("rejects disallowed artifact sources", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-context-disallowed-"));
    const requirements = await createArtifact(runRoot, "requirements", "artifact-requirements", "# Requirements\n\nUse this.");
    const step = testStep();
    const pkg = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for a flower company",
      task: testTask(step),
      step,
      domainSpec: softwareFreelancePack.inferDomainSpec("Build an inventory request system for a flower company"),
      artifactsByType: { requirements },
      messages: [testMessage(step)],
      decisions: [],
      approvals: []
    });
    const artifactIndex = pkg.items.findIndex((item) => item.kind === "artifact");
    pkg.items[artifactIndex] = {
      ...pkg.items[artifactIndex],
      source: "artifact:app:app/src/App.tsx"
    };

    const result = validateContextPackage(pkg);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      `Context item ${pkg.items[artifactIndex].id} includes disallowed artifact source artifact:app:app/src/App.tsx`
    ]));
  });

  it("hashes truncated context item content", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-context-truncate-"));
    const requirements = await createArtifact(runRoot, "requirements", "artifact-requirements", "# Requirements\n\nThis is intentionally long enough to be truncated.");
    const step = testStep();
    const pkg = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for a flower company",
      task: testTask(step),
      step,
      domainSpec: softwareFreelancePack.inferDomainSpec("Build an inventory request system for a flower company"),
      artifactsByType: { requirements },
      messages: [],
      decisions: [],
      approvals: [],
      policy: {
        ...defaultContextPolicyForStep(step),
        maxCharsPerItem: 48,
        maxTotalChars: 1000
      }
    });

    const artifactItem = pkg.items.find((item) => item.kind === "artifact");
    expect(artifactItem?.content).toContain("... [truncated]");
    expect(artifactItem?.content.length).toBeLessThanOrEqual(48);
    expect(artifactItem?.contentHash).toBe(sha256(artifactItem?.content ?? ""));
    expect(validateContextPackage(pkg).ok).toBe(true);
  });

  it("renders model prompts with context metadata and redacted content", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-context-prompt-"));
    const requirements = await createArtifact(runRoot, "requirements", "artifact-requirements", "# Requirements\n\nUse token sk-testsecret1234567890.");
    const step = testStep();
    const pkg = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for sk-testsecret1234567890",
      task: testTask(step),
      step,
      domainSpec: softwareFreelancePack.inferDomainSpec("Build an inventory request system for sk-testsecret1234567890"),
      artifactsByType: { requirements },
      messages: [testMessage(step)],
      decisions: [],
      approvals: []
    });

    const prompt = renderModelPrompt(pkg, {
      fallbackContent: "# Architecture\n\nFallback.",
      outputType: "architecture",
      reviewRequired: false
    });

    expect(prompt).toContain(`Context package: ${pkg.id}`);
    expect(prompt).toContain(`Context hash: ${pkg.contextHash}`);
    expect(prompt).toContain("## artifact | artifact:requirements:planning/requirements.md");
    expect(prompt).toContain(`hash: ${pkg.items[0].contentHash}`);
    expect(prompt).not.toContain("sk-testsecret1234567890");
    expect(prompt).toContain("[REDACTED]");
  });

  it("evaluates action context hash and artifact lineage mismatches", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-context-eval-"));
    const requirements = await createArtifact(runRoot, "requirements", "artifact-requirements", "# Requirements\n\nUse this.");
    const step = testStep();
    const pkg = await assembleContextPackage({
      runId: "context-run",
      goal: "Build an inventory request system for a flower company",
      task: testTask(step),
      step,
      domainSpec: softwareFreelancePack.inferDomainSpec("Build an inventory request system for a flower company"),
      artifactsByType: { requirements },
      messages: [testMessage(step)],
      decisions: [],
      approvals: []
    });
    const architecture = await createArtifact(runRoot, "architecture", "artifact-architecture", "# Architecture\n\nDone.", {
      inputArtifactIds: [requirements.id],
      contextPackageId: pkg.id,
      contextHash: pkg.contextHash
    });
    const validAction = createAction(step, pkg, architecture, [requirements.id]);

    const hashMismatch = evaluateContextPackages({
      runId: "context-run",
      packages: [pkg],
      actions: [{ ...validAction, contextHash: "tampered" }],
      artifacts: [requirements, architecture]
    });
    expect(hashMismatch.provenanceOk).toBe(false);
    expect(hashMismatch.failures).toContain("Agent action technical-architecture contextHash does not match stored package");

    const lineageMismatch = evaluateContextPackages({
      runId: "context-run",
      packages: [pkg],
      actions: [validAction],
      artifacts: [
        requirements,
        {
          ...architecture,
          lineage: {
            ...architecture.lineage,
            contextHash: "tampered"
          }
        }
      ]
    });
    expect(lineageMismatch.provenanceOk).toBe(false);
    expect(lineageMismatch.failures).toContain("Artifact architecture lineage context does not match producing action");
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

async function createArtifact(
  runRoot: string,
  type: Artifact["type"],
  id: string,
  content: string,
  lineage: Artifact["lineage"] = { inputArtifactIds: [] }
): Promise<Artifact> {
  const workspacePath = join(runRoot, "workspace", `${type}.md`);
  await mkdir(join(runRoot, "workspace"), { recursive: true });
  await writeFile(workspacePath, content, "utf8");
  return {
    id,
    type,
    ownerAgentId: type === "architecture" ? "software-architect" : "scope-pm",
    status: "approved",
    workspacePath,
    finalPackagePath: type === "architecture" ? "technical/architecture.md" : `planning/${type}.md`,
    lineage,
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    reviewStatus: "not_required",
    approvalStatus: "approved",
    contentHash: sha256(content)
  };
}

function createAction(step: AgentStep, pkg: ContextPackage, outputArtifact: Artifact, inputArtifactIds: string[]): AgentActionRecord {
  return {
    id: "action-architecture",
    runId: "context-run",
    stepId: step.id,
    agentId: step.ownerAgentId,
    action: step.action,
    outputType: step.outputType,
    inputMessageIds: ["message-architecture"],
    inputArtifactIds,
    contextPackageId: pkg.id,
    contextHash: pkg.contextHash,
    outputArtifactId: outputArtifact.id,
    status: "completed",
    modelMode: "mock",
    provider: "deterministic-mock",
    outputSource: "template",
    reviewRequired: false,
    startedAt: "2026-05-30T00:00:00.000Z",
    completedAt: "2026-05-30T00:00:00.000Z"
  };
}
