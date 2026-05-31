import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateStaticViewer } from "../src/core/viewer.js";
import { loadRunInspection, renderApprovals, renderArtifacts, renderContext, renderContexts, renderEvents, renderGraph, renderInspect, renderTasks } from "../src/inspection.js";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import { runDemo } from "../src/workflow.js";

describe("run inspection", () => {
  it("renders persisted run state for CLI inspection commands", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-inspection-test-"));
    await runDemo({
      goal: "Build a booking system for a barber shop",
      outputRoot,
      runId: "inspect-run",
      repoPath: ".",
      modelProvider: new MockModelProvider()
    });

    const model = await loadRunInspection(outputRoot, "inspect-run");
    expect(renderInspect(model)).toContain("Run ID: inspect-run");
    expect(renderInspect(model)).toContain("Status: completed");
    expect(renderTasks(model)).toContain("builder-app | completed");
    expect(renderGraph(model)).toContain("builder-app | app_generation");
    expect(renderArtifacts(model)).toContain("qa-report | reviewer-qa");
    expect(renderApprovals(model)).toContain("approval-");
    expect(renderContexts(model)).toContain("client-proposal");
    expect(renderContext(model, model.contextPackages[0]?.id)).toContain("Context Package:");
    expect(() => renderContext(model, "missing-context")).toThrow("Context package not found");
    expect(renderEvents(model)).toContain("task.completed");
    expect(model.repoContext?.frameworks).toContain("TypeScript");

    const viewer = await generateStaticViewer(join(outputRoot, "inspect-run"));
    const html = await readFile(viewer.path, "utf8");
    expect(html).toContain("Agentsim Run inspect-run");
    expect(html).toContain("Workflow Graph");
    expect(html).toContain("Tool Registry");
  });
});
