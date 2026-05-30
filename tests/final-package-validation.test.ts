import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateFinalPackage } from "../src/core/final-package-validation.js";
import { sha256 } from "../src/core/hash.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import type { AgentActionRecord, Artifact } from "../src/types.js";

describe("validateFinalPackage", () => {
  it("passes a complete package manifest", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports missing required final-package files", async () => {
    const finalPackageDir = await createCompletePackage();
    await rm(join(finalPackageDir, "client", "user-guide.md"));
    const artifacts = await createArtifacts(finalPackageDir);

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required final-package file: client/user-guide.md");
  });

  it("reports missing required trace files", async () => {
    const finalPackageDir = await createCompletePackage();
    await rm(join(finalPackageDir, "trace", "decisions.json"));
    const artifacts = await createArtifacts(finalPackageDir);

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required trace file: trace/decisions.json");
  });

  it("reports invalid artifact lineage", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    artifacts[0] = { ...artifacts[0], lineage: undefined as unknown as Artifact["lineage"] };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} is missing lineage inputArtifactIds`);
  });

  it("requires review-required artifacts to pass review before final completion", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const appIndex = artifacts.findIndex((artifact) => artifact.type === "app");
    artifacts[appIndex] = { ...artifacts[appIndex], reviewStatus: "pending", approvalStatus: "approved" };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Review-required artifact app must pass review before final completion");
    expect(result.failures).toContain("Artifact app cannot be approved while review is pending");
  });

  it("rejects dangling lineage references and duplicate final package paths", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    artifacts[1] = {
      ...artifacts[1],
      finalPackagePath: artifacts[0].finalPackagePath,
      lineage: { inputArtifactIds: ["missing-artifact"] }
    };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Duplicate final package path: ${artifacts[0].finalPackagePath}`);
    expect(result.failures).toContain(`Artifact ${artifacts[1].type} references unknown input artifact missing-artifact`);
  });

  it("rejects stale artifact content hashes", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    artifacts[0] = { ...artifacts[0], contentHash: sha256("old content") };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} contentHash does not match workspace content`);
  });

  it("rejects artifacts without matching completed agent actions", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const actionsPath = join(finalPackageDir, "trace", "agent-actions.json");
    await writeFile(actionsPath, JSON.stringify({
      actions: createAgentActions(artifacts).map((action, index) => index === 0
        ? { ...action, status: "failed", outputArtifactId: undefined }
        : action)
    }, null, 2), "utf8");

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent action step-0 did not complete");
    expect(result.failures).toContain("Agent action step-0 is missing outputArtifactId");
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} is missing completed agent action`);
  });

  it("rejects malformed agent communication references", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await writeFile(join(finalPackageDir, "trace", "agent-messages.json"), JSON.stringify({
      messages: [
        {
          id: "bad-message",
          runId: "validation-run",
          type: "artifact.handoff",
          from: "builder",
          to: "scope-pm",
          stepId: "step-1",
          artifactId: artifacts[0].id,
          artifactType: artifacts[0].type,
          question: "",
          expectedOutput: "",
          createdAt: "2026-05-30T00:00:00.000Z"
        }
      ]
    }, null, 2), "utf8");
    await writeFile(join(finalPackageDir, "trace", "agent-actions.json"), JSON.stringify({
      actions: createAgentActions(artifacts).map((action, index) => index === 0
        ? { ...action, inputMessageIds: ["missing-message"] }
        : action)
    }, null, 2), "utf8");

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent message bad-message is missing question");
    expect(result.failures).toContain("Agent message bad-message is missing expectedOutput");
    expect(result.failures).toContain(`Agent message bad-message sender builder does not own artifact ${artifacts[0].id}`);
    expect(result.failures).toContain("Agent action step-0 references unknown input message missing-message");
  });

  it("rejects duplicate messages, invalid message types, artifact type mismatches, and empty action inputs", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const messages = createAgentMessages(artifacts);
    await writeFile(join(finalPackageDir, "trace", "agent-messages.json"), JSON.stringify({
      messages: [
        messages[0],
        {
          ...messages[1],
          id: messages[0].id,
          type: "freeform.chat",
          artifactType: "app"
        }
      ]
    }, null, 2), "utf8");
    await writeFile(join(finalPackageDir, "trace", "agent-actions.json"), JSON.stringify({
      actions: createAgentActions(artifacts, messages).map((action, index) => index === 0
        ? { ...action, inputMessageIds: [] }
        : action)
    }, null, 2), "utf8");

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Duplicate agent message id: ${messages[0].id}`);
    expect(result.failures).toContain("Agent message message-0 has unknown type freeform.chat");
    expect(result.failures).toContain(`Agent message message-0 artifactType app does not match artifact ${artifacts[0].type}`);
    expect(result.failures).toContain("Agent action step-0 is missing inputMessageIds");
  });
});

async function createCompletePackage(): Promise<string> {
  const finalPackageDir = join(tmpdir(), `agentsim-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const requiredFiles = [
    ...softwareFreelancePack.requiredFinalPackageFiles,
    ...softwareFreelancePack.requiredTraceFiles
  ];

  for (const relativePath of requiredFiles) {
    const path = join(finalPackageDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "test", "utf8");
  }

  return finalPackageDir;
}

async function createArtifacts(finalPackageDir: string): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];

  for (const [index, item] of softwareFreelancePack.artifactManifest
    .filter((item) => item.required)
    .entries()) {
    const content = `${item.type} content`;
    const workspacePath = join(finalPackageDir, "..", "workspace-artifacts", `${item.type}.md`);
    await mkdir(dirname(workspacePath), { recursive: true });
    await writeFile(workspacePath, content, "utf8");

    artifacts.push({
      id: `artifact-${index}`,
      type: item.type,
      ownerAgentId: item.ownerAgentId,
      status: item.type === "app" ? "exported" : "approved",
      workspacePath,
      finalPackagePath: item.finalPackagePath,
      lineage: { inputArtifactIds: index === 0 ? [] : [`artifact-${index - 1}`] },
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      reviewStatus: item.reviewRequired ? "passed" : "not_required",
      approvalStatus: "approved",
      contentHash: sha256(content)
    });
  }

  const messages = createAgentMessages(artifacts);
  await writeFile(join(finalPackageDir, "trace", "agent-messages.json"), JSON.stringify({ messages }, null, 2), "utf8");
  await writeFile(join(finalPackageDir, "trace", "agent-actions.json"), JSON.stringify({ actions: createAgentActions(artifacts, messages) }, null, 2), "utf8");

  return artifacts;
}

function createAgentActions(artifacts: Artifact[], messages = createAgentMessages(artifacts)): AgentActionRecord[] {
  return artifacts.map((artifact, index) => ({
    id: `action-${index}`,
    runId: "validation-run",
    stepId: `step-${index}`,
    agentId: artifact.ownerAgentId,
    action: `produce ${artifact.type}`,
    outputType: artifact.type,
    inputMessageIds: [messages[index]?.id ?? "missing-message"],
    inputArtifactIds: artifact.lineage.inputArtifactIds,
    outputArtifactId: artifact.id,
    status: "completed",
    modelMode: "mock",
    provider: "deterministic-mock",
    outputSource: "template",
    reviewRequired: artifact.reviewStatus !== "not_required",
    startedAt: "2026-05-30T00:00:00.000Z",
    completedAt: "2026-05-30T00:00:00.000Z"
  }));
}

function createAgentMessages(artifacts: Artifact[]) {
  return artifacts.map((artifact, index) => ({
    id: `message-${index}`,
    runId: "validation-run",
    type: index === 0 ? "task.assignment" : "artifact.handoff",
    from: index === 0 ? "orchestrator" : artifacts[index - 1]?.ownerAgentId ?? "orchestrator",
    to: artifact.ownerAgentId,
    stepId: `step-${index}`,
    artifactId: index === 0 ? undefined : artifacts[index - 1]?.id,
    artifactType: index === 0 ? undefined : artifacts[index - 1]?.type,
    question: `Produce ${artifact.type}`,
    expectedOutput: `Complete ${artifact.type}`,
    createdAt: "2026-05-30T00:00:00.000Z"
  }));
}
