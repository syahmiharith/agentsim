import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Artifact, ArtifactStore, CreateArtifactInput, Workspace } from "../types.js";
import { sha256 } from "./hash.js";

export class FileArtifactStore implements ArtifactStore {
  private readonly artifacts: Artifact[] = [];

  constructor(private readonly workspace: Workspace) {}

  async createMarkdown(input: CreateArtifactInput): Promise<Artifact> {
    const now = new Date().toISOString();
    const workspacePath = join(this.workspace.workspaceDir, input.workspaceRelativePath);
    await mkdir(dirname(workspacePath), { recursive: true });
    await writeFile(workspacePath, input.content, "utf8");

    const artifact: Artifact = {
      id: randomUUID(),
      type: input.type,
      ownerAgentId: input.ownerAgentId,
      status: input.status ?? "draft",
      workspacePath,
      finalPackagePath: input.finalPackagePath,
      lineage: {
        inputArtifactIds: input.inputArtifactIds ?? [],
        promptHash: input.prompt ? sha256(input.prompt) : undefined
      },
      createdAt: now,
      updatedAt: now,
      reviewStatus: input.reviewStatus ?? "pending",
      approvalStatus: input.approvalStatus ?? "pending",
      contentHash: sha256(input.content)
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  list(): Artifact[] {
    return [...this.artifacts];
  }

  async exportLineage(targetPath: string): Promise<void> {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, JSON.stringify({ artifacts: this.artifacts }, null, 2), "utf8");
  }
}
