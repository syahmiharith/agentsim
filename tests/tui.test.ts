import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import { loadRunDebugModel, renderDashboardScreen } from "../src/tui/run-inspector.js";
import { runDemo } from "../src/workflow.js";

describe("run inspector TUI", () => {
  it("loads a run debug model and renders a summary screen", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-tui-test-"));
    await runDemo({
      goal: "Build a booking system for a barber shop",
      outputRoot,
      runId: "debug-run",
      modelProvider: new MockModelProvider()
    });

    const model = await loadRunDebugModel({ outputRoot, runId: "debug-run" });
    expect(model.runId).toBe("debug-run");
    expect(model.domainSpec?.appName).toBe("Barber Booking Desk");
    expect(model.artifacts.length).toBeGreaterThan(0);
    expect(model.events.length).toBeGreaterThan(0);

    const screen = renderDashboardScreen(model, "goal", 0, 100, 34);
    expect(screen).toContain("Agentsim TUI Dashboard");
    expect(screen).toContain("Run: debug-run");
    expect(screen).toContain("[goal]");
    expect(screen).toContain("Current assignment");
    expect(screen).toContain("Barber Booking Desk");
    expect(screen).toContain("barber booking");
    expect(screen).toContain("Director flow");
  });
});
