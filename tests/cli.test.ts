import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("CLI parsing", () => {
  it("parses run goal and mock mode", () => {
    const options = parseArgs(["run", "Build", "inventory", "--mock", "--run-id", "test-run"]);
    expect(options.command).toBe("run");
    expect(options.goal).toBe("Build inventory");
    expect(options.providerSelection).toBe("mock");
    expect(options.runId).toBe("test-run");
  });

  it("keeps demo as a supported alias", () => {
    const options = parseArgs(["demo", "Build", "booking", "--live"]);
    expect(options.command).toBe("demo");
    expect(options.goal).toBe("Build booking");
    expect(options.providerSelection).toBe("live");
  });

  it("parses tui run id and output directory", () => {
    const options = parseArgs(["tui", "test-run", "--out-dir", "custom-outputs"]);
    expect(options.command).toBe("tui");
    expect(options.goal).toBe("test-run");
    expect(options.outputRoot).toBe("custom-outputs");
  });

  it("parses dashboard as the product TUI command", () => {
    const options = parseArgs(["dashboard", "test-run"]);
    expect(options.command).toBe("dashboard");
    expect(options.goal).toBe("test-run");
  });

  it("returns no goal when goal is missing", () => {
    const options = parseArgs(["run", "--mock"]);
    expect(options.goal).toBeUndefined();
  });

  it("rejects mutually exclusive model mode flags", () => {
    expect(() => parseArgs(["run", "Build", "inventory", "--mock", "--live"])).toThrow("--mock or --live");
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["run", "Build", "inventory", "--unknown"])).toThrow();
  });
});
