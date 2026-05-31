import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateFinalPackage } from "../src/core/final-package-validation.js";
import { assembleContextPackage, evaluateContextPackages } from "../src/core/context.js";
import { sha256 } from "../src/core/hash.js";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import type { AgentActionRecord, AgentMessageRecord, AgentStep, Artifact, ContextPackage, Task } from "../src/types.js";

describe("validateFinalPackage", () => {
  it("passes a complete package manifest", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
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
      domainPack: softwareFreelancePack,
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
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required trace file: trace/decisions.json");
  });

  it("rejects missing AppSpec trace", async () => {
    const finalPackageDir = await createCompletePackage();
    await rm(join(finalPackageDir, "trace", "app-spec.json"));
    const artifacts = await createArtifacts(finalPackageDir);

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required trace file: trace/app-spec.json");
  });

  it("rejects invalid AppSpec trace", async () => {
    const finalPackageDir = await createCompletePackage();
    await writeFile(
      join(finalPackageDir, "trace", "app-spec.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          appName: "Broken",
        },
        null,
        2,
      ),
      "utf8",
    );
    const artifacts = await createArtifacts(finalPackageDir);

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("AppSpec trace appArchetype must be crud-workflow");
  });

  it("rejects missing app-validation trace", async () => {
    const finalPackageDir = await createCompletePackage();
    await rm(join(finalPackageDir, "trace", "app-validation.json"));
    const artifacts = await createArtifacts(finalPackageDir);

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required trace file: trace/app-validation.json");
  });

  it("rejects failed app-validation trace", async () => {
    const finalPackageDir = await createCompletePackage();
    await writeFile(
      join(finalPackageDir, "trace", "app-validation.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          ok: false,
          message: "Generated app validation failed 1/1 checks.",
          checks: [{ id: "shape.required-files", status: "failed", message: "Missing generated app files: app/server.js" }],
        },
        null,
        2,
      ),
      "utf8",
    );
    const artifacts = await createArtifacts(finalPackageDir);

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Generated app validation trace reports ok: false");
  });

  it("rejects private local paths in final-package trace files", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const privatePath = join(finalPackageDir, "..", "workspace-artifacts");
    await writeFile(
      join(finalPackageDir, "trace", "decisions.json"),
      JSON.stringify(
        {
          decisions: [{ id: "leak", localPath: privatePath }],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
      privatePathPrefixes: [privatePath],
    });

    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("trace\\decisions.json") || failure.includes("trace/decisions.json"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("private local path"))).toBe(true);
  });

  it("rejects escaped private paths in nested trace files", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const privatePath = join(finalPackageDir, "..", "workspace-artifacts");
    const nestedTraceDir = join(finalPackageDir, "trace", "nested");
    await mkdir(nestedTraceDir, { recursive: true });
    await writeFile(
      join(nestedTraceDir, "leak.json"),
      JSON.stringify(
        {
          localPath: privatePath.replaceAll("\\", "/"),
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
      privatePathPrefixes: [privatePath],
    });

    expect(result.ok).toBe(false);
    expect(result.failures.some((failure) => failure.includes("nested"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("private local path"))).toBe(true);
  });

  it("requires context package and evaluation trace files", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await rm(join(finalPackageDir, "trace", "context-packages.json"));

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required trace file: trace/context-packages.json");
  });

  it("rejects actions without context provenance", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const actionsPath = join(finalPackageDir, "trace", "agent-actions.json");
    const actions = createAgentActions(artifacts);
    await writeFile(
      actionsPath,
      JSON.stringify(
        {
          actions: actions.map((action, index) => (index === 0 ? { ...action, contextPackageId: undefined, contextHash: undefined } : action)),
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent action step-0 is missing contextPackageId");
  });

  it("rejects tampered action context hashes", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const actionsPath = join(finalPackageDir, "trace", "agent-actions.json");
    await writeFile(
      actionsPath,
      JSON.stringify(
        {
          actions: createAgentActions(artifacts).map((action, index) => (index === 0 ? { ...action, contextHash: "tampered" } : action)),
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent action step-0 contextHash does not match stored context package");
  });

  it("rejects artifacts without matching context lineage", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const expectedContextPackageId = artifacts[0].lineage.contextPackageId;
    artifacts[0] = {
      ...artifacts[0],
      lineage: { ...artifacts[0].lineage, contextPackageId: undefined, contextHash: undefined },
    };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} lineage is missing contextPackageId ${expectedContextPackageId}`);
  });

  it("rejects tampered context item hashes and failed context eval", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const contextPath = join(finalPackageDir, "trace", "context-packages.json");
    const contextTrace = JSON.parse(await readFile(contextPath, "utf8"));
    contextTrace.contextPackages[0].items[0].contentHash = "tampered";
    await writeFile(contextPath, JSON.stringify(contextTrace, null, 2), "utf8");
    await writeFile(
      join(finalPackageDir, "trace", "context-eval.json"),
      JSON.stringify(
        {
          evaluation: {
            runId: "validation-run",
            generatedAt: "2026-05-30T00:00:00.000Z",
            packageCount: contextTrace.contextPackages.length,
            actionCount: artifacts.length,
            artifactCount: artifacts.length,
            totalItemCount: 1,
            totalChars: 1,
            requiredCoverageOk: false,
            provenanceOk: false,
            failures: ["missing context"],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        `Context item ${contextTrace.contextPackages[0].items[0].id} contentHash does not match content`,
        "Context evaluation reports incomplete required coverage",
        "Context evaluation reports incomplete provenance",
        "Context evaluation failure: missing context",
      ]),
    );
  });

  it("rejects context evaluation traces without an evaluation payload", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await writeFile(join(finalPackageDir, "trace", "context-eval.json"), JSON.stringify({}, null, 2), "utf8");

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Context evaluation trace is missing evaluation");
  });

  it("reports invalid artifact lineage", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    artifacts[0] = { ...artifacts[0], lineage: undefined as unknown as Artifact["lineage"] };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
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
      domainPack: softwareFreelancePack,
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
      lineage: { inputArtifactIds: ["missing-artifact"] },
    };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
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
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} contentHash does not match workspace content`);
  });

  it("rejects artifacts without matching completed agent actions", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const actionsPath = join(finalPackageDir, "trace", "agent-actions.json");
    await writeFile(
      actionsPath,
      JSON.stringify(
        {
          actions: createAgentActions(artifacts).map((action, index) => (index === 0 ? { ...action, status: "failed", outputArtifactId: undefined } : action)),
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent action step-0 did not complete");
    expect(result.failures).toContain("Agent action step-0 is missing outputArtifactId");
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} is missing completed agent action`);
  });

  it("rejects malformed agent communication references", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await writeFile(
      join(finalPackageDir, "trace", "agent-messages.json"),
      JSON.stringify(
        {
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
              createdAt: "2026-05-30T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(finalPackageDir, "trace", "agent-actions.json"),
      JSON.stringify(
        {
          actions: createAgentActions(artifacts).map((action, index) => (index === 0 ? { ...action, inputMessageIds: ["missing-message"] } : action)),
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent message bad-message is missing question");
    expect(result.failures).toContain("Agent message bad-message is missing expectedOutput");
    expect(result.failures).toContain(`Agent message bad-message sender builder does not own artifact ${artifacts[0].id}`);
    expect(result.failures).toContain("Agent action step-0 references unknown input message missing-message");
  });

  it("rejects invalid agent message trace JSON", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await writeFile(join(finalPackageDir, "trace", "agent-messages.json"), "{not-json", "utf8");

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent message trace is not valid JSON");
  });

  it("rejects messages with unknown recipients and missing artifact references", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await writeFile(
      join(finalPackageDir, "trace", "agent-messages.json"),
      JSON.stringify(
        {
          messages: [
            {
              id: "dangling-message",
              runId: "validation-run",
              type: "artifact.handoff",
              from: "orchestrator",
              to: "unknown-agent",
              stepId: "step-1",
              artifactId: "missing-artifact",
              artifactType: artifacts[0].type,
              question: "Review this artifact",
              expectedOutput: "Confirm handoff",
              createdAt: "2026-05-30T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent message dangling-message has unknown recipient unknown-agent");
    expect(result.failures).toContain("Agent message dangling-message references unknown artifact missing-artifact");
  });

  it("rejects messages from unknown senders", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    await writeFile(
      join(finalPackageDir, "trace", "agent-messages.json"),
      JSON.stringify(
        {
          messages: [
            {
              id: "unknown-sender-message",
              runId: "validation-run",
              type: "task.assignment",
              from: "unknown-agent",
              to: "scope-pm",
              stepId: "step-1",
              question: "Produce requirements",
              expectedOutput: "Requirements document",
              createdAt: "2026-05-30T00:00:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Agent message unknown-sender-message has unknown sender unknown-agent");
  });

  it("rejects duplicate messages, invalid message types, artifact type mismatches, and empty action inputs", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = await createArtifacts(finalPackageDir);
    const messages = createAgentMessages(artifacts);
    await writeFile(
      join(finalPackageDir, "trace", "agent-messages.json"),
      JSON.stringify(
        {
          messages: [
            messages[0],
            {
              ...messages[1],
              id: messages[0].id,
              type: "freeform.chat",
              artifactType: "app",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(finalPackageDir, "trace", "agent-actions.json"),
      JSON.stringify(
        {
          actions: createAgentActions(artifacts, messages).map((action, index) => (index === 0 ? { ...action, inputMessageIds: [] } : action)),
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack,
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
  const requiredFiles = [...softwareFreelancePack.requiredFinalPackageFiles, ...softwareFreelancePack.requiredTraceFiles];

  for (const relativePath of requiredFiles) {
    const path = join(finalPackageDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "test", "utf8");
  }
  await writeFile(
    join(finalPackageDir, "trace", "workflow-graph.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        runId: "validation-run",
        generatedAt: "2026-05-30T00:00:00.000Z",
        nodes: [{ id: "step-0", kind: "artifact_generation", agentId: "client-intake", outputArtifactType: "project-summary" }],
        edges: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(finalPackageDir, "trace", "tool-registry.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        tools: [{ name: "write_file", riskLevel: "medium", requiresApproval: false, description: "Write a file.", provider: "builtin" }],
      },
      null,
      2,
    ),
    "utf8",
  );
  const domainSpec = softwareFreelancePack.inferDomainSpec("Build an inventory request system for a flower company");
  const appSpec = appSpecFromDomainSpec(domainSpec);
  await writeFile(join(finalPackageDir, "trace", "app-spec.json"), JSON.stringify(appSpec, null, 2), "utf8");
  await writeFile(
    join(finalPackageDir, "trace", "app-validation.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        ok: true,
        message: "Generated app validation passed 7/7 checks.",
        checks: [{ id: "shape.required-files", status: "passed", message: "Generated app required files are present." }],
      },
      null,
      2,
    ),
    "utf8",
  );

  return finalPackageDir;
}

async function createArtifacts(finalPackageDir: string): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];

  for (const [index, item] of softwareFreelancePack.artifactManifest.filter((item) => item.required).entries()) {
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
      contentHash: sha256(content),
    });
  }

  const messages = createAgentMessages(artifacts);
  const contextPackages = await createContextPackages(artifacts, messages);
  for (const [index, artifact] of artifacts.entries()) {
    const contextPackage = contextPackages[index];
    artifact.lineage = {
      ...artifact.lineage,
      contextPackageId: contextPackage?.id,
      contextHash: contextPackage?.contextHash,
    };
  }
  const actions = createAgentActions(artifacts, messages, contextPackages);
  await writeFile(join(finalPackageDir, "trace", "agent-messages.json"), JSON.stringify({ messages }, null, 2), "utf8");
  await writeFile(join(finalPackageDir, "trace", "agent-actions.json"), JSON.stringify({ actions }, null, 2), "utf8");
  await writeFile(join(finalPackageDir, "trace", "context-packages.json"), JSON.stringify({ contextPackages }, null, 2), "utf8");
  await writeFile(
    join(finalPackageDir, "trace", "context-eval.json"),
    JSON.stringify(
      {
        evaluation: evaluateContextPackages({ runId: "validation-run", packages: contextPackages, actions, artifacts }),
      },
      null,
      2,
    ),
    "utf8",
  );

  return artifacts;
}

async function createContextPackages(artifacts: Artifact[], messages = createAgentMessages(artifacts)): Promise<ContextPackage[]> {
  const domainSpec = softwareFreelancePack.inferDomainSpec("Build an inventory request system for a flower company");
  const artifactsByType = Object.fromEntries(artifacts.map((artifact) => [artifact.type, artifact]));
  const contextPackages: ContextPackage[] = [];
  for (const [index, artifact] of artifacts.entries()) {
    const requiredInputs = index === 0 ? [] : ([artifacts[index - 1]?.type].filter(Boolean) as AgentStep["requiredInputs"]);
    const step: AgentStep = {
      id: `step-${index}`,
      ownerAgentId: artifact.ownerAgentId,
      action: `produce ${artifact.type}`,
      outputType: artifact.type,
      requiredInputs,
      reviewRequired: artifact.reviewStatus !== "not_required",
      async execute() {
        throw new Error("test helper step should not execute");
      },
    };
    const task: Task = {
      id: step.id,
      runId: "validation-run",
      title: `Produce ${artifact.type}`,
      description: `Complete ${artifact.type}`,
      kind: "artifact_generation",
      assignedAgentId: artifact.ownerAgentId,
      status: "completed",
      dependsOn: [],
      requiredArtifactTypes: requiredInputs,
      outputArtifactType: artifact.type,
      attempts: 1,
      maxAttempts: 2,
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
    };
    contextPackages.push(
      await assembleContextPackage({
        runId: "validation-run",
        goal: "Build an inventory request system for a flower company",
        task,
        step,
        domainSpec,
        artifactsByType,
        messages: [messages[index]],
        decisions: [],
        approvals: [],
      }),
    );
  }
  return contextPackages;
}

function createAgentActions(artifacts: Artifact[], messages = createAgentMessages(artifacts), contextPackages: ContextPackage[] = []): AgentActionRecord[] {
  return artifacts.map((artifact, index) => ({
    id: `action-${index}`,
    runId: "validation-run",
    stepId: `step-${index}`,
    agentId: artifact.ownerAgentId,
    action: `produce ${artifact.type}`,
    outputType: artifact.type,
    inputMessageIds: [messages[index]?.id ?? "missing-message"],
    inputArtifactIds: artifact.lineage.inputArtifactIds,
    contextPackageId: contextPackages[index]?.id ?? artifact.lineage.contextPackageId,
    contextHash: contextPackages[index]?.contextHash ?? artifact.lineage.contextHash,
    outputArtifactId: artifact.id,
    status: "completed",
    modelMode: "mock",
    provider: "deterministic-mock",
    outputSource: "template",
    reviewRequired: artifact.reviewStatus !== "not_required",
    startedAt: "2026-05-30T00:00:00.000Z",
    completedAt: "2026-05-30T00:00:00.000Z",
  }));
}

function createAgentMessages(artifacts: Artifact[]): AgentMessageRecord[] {
  return artifacts.map((artifact, index) => ({
    id: `message-${index}`,
    runId: "validation-run",
    type: index === 0 ? "task.assignment" : "artifact.handoff",
    from: index === 0 ? "orchestrator" : (artifacts[index - 1]?.ownerAgentId ?? "orchestrator"),
    to: artifact.ownerAgentId,
    stepId: `step-${index}`,
    artifactId: index === 0 ? undefined : artifacts[index - 1]?.id,
    artifactType: index === 0 ? undefined : artifacts[index - 1]?.type,
    question: `Produce ${artifact.type}`,
    expectedOutput: `Complete ${artifact.type}`,
    createdAt: "2026-05-30T00:00:00.000Z",
  }));
}
