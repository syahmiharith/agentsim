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

  it("parses inspection commands", () => {
    const options = parseArgs(["inspect", "test-run", "--out-dir", "custom-outputs"]);
    expect(options.command).toBe("inspect");
    expect(options.runId).toBe("test-run");
    expect(options.outputRoot).toBe("custom-outputs");

    const contexts = parseArgs(["contexts", "test-run"]);
    expect(contexts.command).toBe("contexts");
    expect(contexts.runId).toBe("test-run");

    const context = parseArgs(["context", "test-run", "ctx-1"]);
    expect(context.command).toBe("context");
    expect(context.runId).toBe("test-run");
    expect(context.contextPackageId).toBe("ctx-1");
  });

  it("parses approval and resume commands", () => {
    const approval = parseArgs(["approve", "test-run", "approval-1"]);
    expect(approval.command).toBe("approve");
    expect(approval.runId).toBe("test-run");
    expect(approval.approvalId).toBe("approval-1");

    const resume = parseArgs(["resume", "test-run"]);
    expect(resume.command).toBe("resume");
    expect(resume.runId).toBe("test-run");
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
