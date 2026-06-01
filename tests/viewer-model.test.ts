import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRunViewerModel, readFinalPackageFile } from "../src/viewer/load-run-viewer-model.js";
import { createViewerRun } from "./viewer-fixture.js";

describe("run viewer model", () => {
  it("loads a completed run into the read-only viewer model", async () => {
    const runRoot = await createViewerRun();
    const model = await loadRunViewerModel(runRoot);

    expect(model.run.id).toBe("viewer-run");
    expect(model.run.outputDir).toBe("<outputs>/viewer-run");
    expect(model.goal.appName).toBe("Viewer Desk");
    expect(model.goal.deferredFeatures).toContain("Authentication is deferred.");
    expect(model.progress.taskCount).toBe(1);
    expect(model.progress.completed).toBe(1);
    expect(model.decisions[0]?.title).toBe("Domain");
    expect(model.review.qaReport?.content).toContain("Generated App Validation");
    expect(model.trace.eventsPreview[0]).toMatchObject({ name: "run.completed" });
    expect(model.trace.commandResultsPreview[0]).toMatchObject({ command: "node", cwd: "final-package/app" });
    expect(model.finalPackage.files.some((node) => node.name === "client")).toBe(true);
  });

  it("handles missing optional trace files", async () => {
    const runRoot = await createViewerRun();
    await rm(join(runRoot, "final-package", "trace", "product-brief.json"));
    await rm(join(runRoot, "final-package", "trace", "command-results.jsonl"));

    const model = await loadRunViewerModel(runRoot);

    expect(model.trace.productBrief).toBeUndefined();
    expect(model.trace.commandResultsPreview).toEqual([]);
  });

  it("blocks final package path traversal", async () => {
    const runRoot = await createViewerRun();

    await expect(readFinalPackageFile(runRoot, "../state/run.json")).rejects.toThrow("Path escapes workspace");
    await expect(readFinalPackageFile(runRoot, "client/project-summary.md")).resolves.toMatchObject({
      path: "client/project-summary.md",
    });
  });
});
