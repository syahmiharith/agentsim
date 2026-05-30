import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import { loadRunDebugModel, renderRunDebugScreen } from "../src/tui/run-inspector.js";
import { runDemo } from "../src/workflow.js";

describe("run inspector TUI", () => {
  it("loads a run debug model and renders a summary screen", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-tui-test-"));
    await runDemo({
      goal: "Build an inventory request system for a flower company",
      outputRoot,
      runId: "debug-run",
      modelProvider: new MockModelProvider()
    });

    const model = await loadRunDebugModel({ outputRoot, runId: "debug-run" });
    expect(model.runId).toBe("debug-run");
    expect(model.artifacts.length).toBeGreaterThan(0);
    expect(model.events.length).toBeGreaterThan(0);

    const screen = renderRunDebugScreen(model, "summary", 0, 100, 30);
    expect(screen).toContain("Agentsim Debug TUI");
    expect(screen).toContain("Run: debug-run");
    expect(screen).toContain("[summary]");
    expect(screen).toContain("Artifacts:");
  });
});

