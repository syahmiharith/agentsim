import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, DomainPack, ValidationResult } from "../types.js";
import { sha256 } from "./hash.js";

export interface FinalPackageValidationInput {
  finalPackageDir: string;
  artifacts: Artifact[];
  domainPack: DomainPack;
}

export async function validateFinalPackage(input: FinalPackageValidationInput): Promise<ValidationResult> {
  const failures: string[] = [];
  const agentIds = new Set(input.domainPack.agents.map((agent) => agent.id));
  const artifactIds = new Set(input.artifacts.map((artifact) => artifact.id));
  const seenTypes = new Set<string>();
  const duplicateTypes = new Set<string>();
  const seenFinalPackagePaths = new Set<string>();
  const duplicateFinalPackagePaths = new Set<string>();

  for (const manifestItem of input.domainPack.artifactManifest) {
    if (!agentIds.has(manifestItem.ownerAgentId)) {
      failures.push(`Manifest artifact ${manifestItem.type} references unknown owner agent ${manifestItem.ownerAgentId}`);
    }
  }

  for (const artifact of input.artifacts) {
    if (seenTypes.has(artifact.type)) {
      duplicateTypes.add(artifact.type);
    }
    seenTypes.add(artifact.type);

    if (seenFinalPackagePaths.has(artifact.finalPackagePath)) {
      duplicateFinalPackagePaths.add(artifact.finalPackagePath);
    }
    seenFinalPackagePaths.add(artifact.finalPackagePath);
  }

  for (const type of duplicateTypes) {
    failures.push(`Duplicate artifact type: ${type}`);
  }

  for (const finalPackagePath of duplicateFinalPackagePaths) {
    failures.push(`Duplicate final package path: ${finalPackagePath}`);
  }

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
    if (manifestItem.reviewRequired && artifact.reviewStatus !== "passed") {
      failures.push(`Review-required artifact ${artifact.type} must pass review before final completion`);
    }
    if (manifestItem.finalPackagePath !== "app/" && !(await pathExists(join(input.finalPackageDir, manifestItem.finalPackagePath)))) {
      failures.push(`Required artifact ${artifact.type} is missing exported file ${manifestItem.finalPackagePath}`);
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
    } else {
      for (const inputArtifactId of artifact.lineage.inputArtifactIds) {
        if (!artifactIds.has(inputArtifactId)) {
          failures.push(`Artifact ${artifact.type} references unknown input artifact ${inputArtifactId}`);
        }
      }
    }
    if (!agentIds.has(artifact.ownerAgentId)) {
      failures.push(`Artifact ${artifact.type} is owned by unknown agent ${artifact.ownerAgentId}`);
    }
    if (artifact.approvalStatus === "approved" && artifact.reviewStatus === "pending") {
      failures.push(`Artifact ${artifact.type} cannot be approved while review is pending`);
    }
    if (artifact.approvalStatus === "approved" && artifact.reviewStatus === "failed") {
      failures.push(`Artifact ${artifact.type} cannot be approved after failed review`);
    }
    if (artifact.contentHash) {
      try {
        const content = await readFile(artifact.workspacePath, "utf8");
        const actualHash = sha256(content);
        if (actualHash !== artifact.contentHash) {
          failures.push(`Artifact ${artifact.type} contentHash does not match workspace content`);
        }
      } catch {
        failures.push(`Artifact ${artifact.type} workspace file is missing or unreadable`);
      }
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
