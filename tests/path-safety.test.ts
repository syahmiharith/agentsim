import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FileArtifactStore } from "../src/core/artifacts.js";
import { safeJoin } from "../src/core/paths.js";
import { LocalFilesystemWorkspaceDriver } from "../src/core/workspace.js";

describe("path safety", () => {
  it("accepts safe root and nested paths", () => {
    const root = resolve("workspace");
    expect(safeJoin(root, "file.txt")).toBe(resolve(root, "file.txt"));
    expect(safeJoin(root, "nested/file.txt")).toBe(resolve(root, "nested/file.txt"));
  });

  it("rejects workspace escapes and absolute paths", () => {
    const root = resolve("workspace");
    expect(() => safeJoin(root, "../file.txt")).toThrow("Path escapes workspace");
    expect(() => safeJoin(root, "../../file.txt")).toThrow("Path escapes workspace");
    expect(() => safeJoin(root, resolve("outside.txt"))).toThrow("Absolute paths are not allowed");
  });

  it("rejects workspace write, read, and list escapes", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-path-test-"));
    const driver = new LocalFilesystemWorkspaceDriver();
    const workspace = await driver.create("safe-run", outputRoot);

    await expect(driver.writeFile(workspace, "../escape.txt", "bad")).rejects.toThrow("Path escapes workspace");
    await expect(driver.readFile(workspace, "../escape.txt")).rejects.toThrow("Path escapes workspace");
    await expect(driver.listFiles(workspace, "../")).rejects.toThrow("Path escapes workspace");
  });

  it("rejects artifact workspace and final package path escapes", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-artifact-path-test-"));
    const driver = new LocalFilesystemWorkspaceDriver();
    const workspace = await driver.create("artifact-run", outputRoot);
    const store = new FileArtifactStore(workspace);

    await expect(store.createMarkdown({
      type: "requirements",
      ownerAgentId: "scope-pm",
      content: "content",
      workspaceRelativePath: "../requirements.md",
      finalPackagePath: "planning/requirements.md"
    })).rejects.toThrow("Path escapes workspace");

    await expect(store.createMarkdown({
      type: "requirements",
      ownerAgentId: "scope-pm",
      content: "content",
      workspaceRelativePath: "artifacts/requirements.md",
      finalPackagePath: "../requirements.md"
    })).rejects.toThrow("Path escapes workspace");
  });
});
