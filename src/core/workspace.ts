import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Workspace, WorkspaceDriver } from "../types.js";

export class LocalFilesystemWorkspaceDriver implements WorkspaceDriver {
  async create(runId: string, outputRoot: string): Promise<Workspace> {
    const rootDir = join(outputRoot, runId);
    const workspaceDir = join(rootDir, "workspace");
    const finalPackageDir = join(rootDir, "final-package");

    await mkdir(workspaceDir, { recursive: true });
    await mkdir(finalPackageDir, { recursive: true });

    return { runId, rootDir, workspaceDir, finalPackageDir };
  }

  async writeFile(workspace: Workspace, relativePath: string, content: string): Promise<string> {
    const absolutePath = join(workspace.workspaceDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    return absolutePath;
  }

  async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });
    await cp(sourceDir, targetDir, { recursive: true });
  }
}
