import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("CLI parsing", () => {
  it("parses demo goal and mock mode", () => {
    const options = parseArgs(["demo", "Build", "inventory", "--mock", "--run-id", "test-run"]);
    expect(options.command).toBe("demo");
    expect(options.goal).toBe("Build inventory");
    expect(options.providerSelection).toBe("mock");
    expect(options.runId).toBe("test-run");
  });

  it("returns no goal when goal is missing", () => {
    const options = parseArgs(["demo", "--mock"]);
    expect(options.goal).toBeUndefined();
  });
});

