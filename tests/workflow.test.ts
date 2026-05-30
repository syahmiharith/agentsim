import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import { runDemo } from "../src/workflow.js";

describe("demo workflow", () => {
  it("creates the required final package in mock mode", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-test-"));
    const result = await runDemo({
      goal: "Build an inventory request system for a flower company",
      outputRoot,
      runId: "test-run",
      modelProvider: new MockModelProvider()
    });

    expect(result.taskRun.status).toBe("completed");
    expect(result.artifacts.length).toBeGreaterThanOrEqual(15);

    const required = [
      "client/proposal.md",
      "client/project-summary.md",
      "client/handoff-guide.md",
      "planning/requirements.md",
      "planning/scope.md",
      "planning/assumptions.md",
      "planning/timeline.md",
      "planning/risks.md",
      "planning/task-breakdown.md",
      "technical/architecture.md",
      "technical/database-schema.md",
      "technical/api-plan.md",
      "app/package.json",
      "app/src/App.tsx",
      "app/server.js",
      "app/README.md",
      "review/qa-report.md",
      "review/code-review.md",
      "review/known-issues.md",
      "trace/events.jsonl",
      "trace/approvals.json",
      "trace/decisions.json",
      "trace/domain-spec.json",
      "trace/artifact-lineage.json"
    ];

    for (const relativePath of required) {
      await expect(stat(join(result.finalPackageDir, relativePath))).resolves.toBeTruthy();
    }

    const lineage = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "artifact-lineage.json"), "utf8"));
    expect(lineage.artifacts.every((artifact: { contentHash?: string }) => Boolean(artifact.contentHash))).toBe(true);

    const events = await readFile(join(result.finalPackageDir, "trace", "events.jsonl"), "utf8");
    expect(events).toContain("run.completed");

    const appReadme = await readFile(join(result.finalPackageDir, "app", "README.md"), "utf8");
    expect(appReadme).toContain("pnpm dev:api");
    expect(appReadme).toContain("pnpm dev:web");

    const domainSpec = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-spec.json"), "utf8"));
    expect(domainSpec.appName).toBe("Inventory Request Desk");
  });

  it("creates prompt-specific docs and app files for a barber booking prompt", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-barber-test-"));
    const result = await runDemo({
      goal: "Build a booking system for a barber shop",
      outputRoot,
      runId: "barber-run",
      modelProvider: new MockModelProvider()
    });

    const domainSpec = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-spec.json"), "utf8"));
    expect(domainSpec.appName).toBe("Barber Booking Desk");
    expect(domainSpec.primaryEntity.name).toBe("Booking");
    expect(domainSpec.workflowStatuses).toContain("Confirmed");

    const requirements = await readFile(join(result.finalPackageDir, "planning", "requirements.md"), "utf8");
    expect(requirements).toContain("service");
    expect(requirements).toContain("Appointment date/time");
    expect(requirements).toContain("Confirmed");

    const app = await readFile(join(result.finalPackageDir, "app", "src", "App.tsx"), "utf8");
    expect(app).toContain("Barber Booking Desk");
    expect(app).toContain("service");
    expect(app).toContain("appointmentDateTime");
    expect(app).toContain("Confirmed");

    const packageJson = await readFile(join(result.finalPackageDir, "app", "package.json"), "utf8");
    expect(packageJson).toContain("barber-booking-desk");

    const combined = `${requirements}\n${app}\n${packageJson}`.toLowerCase();
    for (const forbidden of ["flower company", "white roses", "inventory request", "supplier"]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it.each([
    ["Build a clinic appointment system", "Clinic Appointment Desk", "Appointment", "Scheduled"],
    ["Build a restaurant reservation system", "Restaurant Reservation Desk", "Reservation", "Seated"],
    ["Build an equipment checkout system for a university club", "Club Equipment Checkout", "Checkout", "Overdue"]
  ])("creates distinct domain packages for %s", async (goal, appName, entityName, status) => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-domain-test-"));
    const result = await runDemo({
      goal,
      outputRoot,
      runId: appName.toLowerCase().replace(/\s+/g, "-"),
      modelProvider: new MockModelProvider()
    });

    const domainSpec = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-spec.json"), "utf8"));
    expect(domainSpec.appName).toBe(appName);
    expect(domainSpec.primaryEntity.name).toBe(entityName);
    expect(domainSpec.workflowStatuses).toContain(status);

    const app = await readFile(join(result.finalPackageDir, "app", "src", "App.tsx"), "utf8");
    const readme = await readFile(join(result.finalPackageDir, "app", "README.md"), "utf8");
    expect(app).toContain(appName);
    expect(app).toContain(status);
    expect(readme).toContain(appName);
    expect(readme).toContain("pnpm dev:api");
    expect(readme).toContain("pnpm dev:web");
  });
});
