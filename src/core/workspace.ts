import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { Workspace, WorkspaceDriver } from "../types.js";
import { assertPathInside, safeJoin } from "./paths.js";

export class LocalFilesystemWorkspaceDriver implements WorkspaceDriver {
  private readonly createdRoots = new Set<string>();

  async create(runId: string, outputRoot: string): Promise<Workspace> {
    const rootDir = safeJoin(outputRoot, runId);
    const workspaceDir = join(rootDir, "workspace");
    const finalPackageDir = join(rootDir, "final-package");

    await mkdir(workspaceDir, { recursive: true });
    await mkdir(finalPackageDir, { recursive: true });

    this.createdRoots.add(assertPathInside(rootDir, rootDir, "workspace root"));
    return { runId, rootDir, workspaceDir, finalPackageDir };
  }

  async writeFile(workspace: Workspace, relativePath: string, content: string): Promise<string> {
    const absolutePath = safeJoin(workspace.workspaceDir, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    return absolutePath;
  }

  async readFile(workspace: Workspace, relativePath: string): Promise<string> {
    return readFile(safeJoin(workspace.workspaceDir, relativePath), "utf8");
  }

  async listFiles(workspace: Workspace, relativePath = "."): Promise<string[]> {
    const root = safeJoin(workspace.workspaceDir, relativePath);
    const files: string[] = [];

    async function walk(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
        } else {
          files.push(relative(workspace.workspaceDir, path));
        }
      }
    }

    await walk(root);
    return files.sort();
  }

  async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    const source = this.assertInsideCreatedRun(sourceDir, "copy source");
    const target = this.assertInsideCreatedRun(targetDir, "copy target");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true });
  }

  private assertInsideCreatedRun(path: string, label: string): string {
    for (const root of this.createdRoots) {
      try {
        return assertPathInside(root, path, label);
      } catch {
        // Try the next created run root.
      }
    }
    throw new Error(`${label} is not inside a known workspace root: ${path}`);
  }
}
