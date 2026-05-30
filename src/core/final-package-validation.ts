import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, DomainPack, ValidationResult } from "../types.js";

export interface FinalPackageValidationInput {
  finalPackageDir: string;
  artifacts: Artifact[];
  domainPack: DomainPack;
}

export async function validateFinalPackage(input: FinalPackageValidationInput): Promise<ValidationResult> {
  const failures: string[] = [];

  for (const relativePath of input.domainPack.requiredFinalPackageFiles) {
    if (!(await pathExists(join(input.finalPackageDir, relativePath)))) {
      failures.push(`Missing required final-package file: ${relativePath}`);
    }
  }

  for (const relativePath of input.domainPack.requiredTraceFiles) {
    if (!(await pathExists(join(input.finalPackageDir, relativePath)))) {
      failures.push(`Missing required trace file: ${relativePath}`);
    }
  }

  for (const manifestItem of input.domainPack.artifactManifest.filter((item) => item.required)) {
    const artifact = input.artifacts.find((candidate) => candidate.type === manifestItem.type);
    if (!artifact) {
      failures.push(`Missing required artifact: ${manifestItem.type}`);
      continue;
    }
    if (artifact.ownerAgentId !== manifestItem.ownerAgentId) {
      failures.push(`Artifact ${artifact.type} is owned by ${artifact.ownerAgentId}, expected ${manifestItem.ownerAgentId}`);
    }
    if (artifact.finalPackagePath !== manifestItem.finalPackagePath) {
      failures.push(`Artifact ${artifact.type} exports to ${artifact.finalPackagePath}, expected ${manifestItem.finalPackagePath}`);
    }
  }

  for (const artifact of input.artifacts) {
    if (!artifact.contentHash) {
      failures.push(`Artifact ${artifact.type} is missing contentHash`);
    }
    if (!artifact.ownerAgentId) {
      failures.push(`Artifact ${artifact.type} is missing ownerAgentId`);
    }
    if (!artifact.status) {
      failures.push(`Artifact ${artifact.type} is missing status`);
    }
    if (!artifact.lineage || !Array.isArray(artifact.lineage.inputArtifactIds)) {
      failures.push(`Artifact ${artifact.type} is missing lineage inputArtifactIds`);
    }
  }

  const reviewerArtifacts = input.artifacts.filter((artifact) => artifact.ownerAgentId === "reviewer-qa");
  for (const requiredType of ["qa-report", "code-review", "known-issues"]) {
    if (!reviewerArtifacts.some((artifact) => artifact.type === requiredType)) {
      failures.push(`Missing reviewer artifact: ${requiredType}`);
    }
  }

  for (const artifact of reviewerArtifacts) {
    if (artifact.reviewStatus !== "passed" && artifact.reviewStatus !== "failed") {
      failures.push(`Reviewer artifact ${artifact.type} must explicitly pass or fail review`);
    }
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
