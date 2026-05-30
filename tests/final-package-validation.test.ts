import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateFinalPackage } from "../src/core/final-package-validation.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import type { Artifact } from "../src/types.js";

describe("validateFinalPackage", () => {
  it("passes a complete package manifest", async () => {
    const finalPackageDir = await createCompletePackage();
    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts: createArtifacts(),
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports missing required final-package files", async () => {
    const finalPackageDir = await createCompletePackage();
    await rm(join(finalPackageDir, "client", "user-guide.md"));

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts: createArtifacts(),
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required final-package file: client/user-guide.md");
  });

  it("reports missing required trace files", async () => {
    const finalPackageDir = await createCompletePackage();
    await rm(join(finalPackageDir, "trace", "decisions.json"));

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts: createArtifacts(),
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("Missing required trace file: trace/decisions.json");
  });

  it("reports invalid artifact lineage", async () => {
    const finalPackageDir = await createCompletePackage();
    const artifacts = createArtifacts();
    artifacts[0] = { ...artifacts[0], lineage: undefined as unknown as Artifact["lineage"] };

    const result = await validateFinalPackage({
      finalPackageDir,
      artifacts,
      domainPack: softwareFreelancePack
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`Artifact ${artifacts[0].type} is missing lineage inputArtifactIds`);
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

function createArtifacts(): Artifact[] {
  return softwareFreelancePack.artifactManifest
    .filter((item) => item.required)
    .map((item, index) => ({
      id: `artifact-${index}`,
      type: item.type,
      ownerAgentId: item.ownerAgentId,
      status: item.type === "app" ? "exported" : "approved",
      workspacePath: `workspace/${item.finalPackagePath}`,
      finalPackagePath: item.finalPackagePath,
      lineage: { inputArtifactIds: index === 0 ? [] : [`artifact-${index - 1}`] },
      createdAt: "2026-05-30T00:00:00.000Z",
      updatedAt: "2026-05-30T00:00:00.000Z",
      reviewStatus: item.ownerAgentId === "reviewer-qa" ? "passed" : item.reviewRequired ? "pending" : "not_required",
      approvalStatus: "approved",
      contentHash: `hash-${index}`
    }));
}
