import { describe, expect, it } from "vitest";
import { agentSteps } from "../src/agents/steps.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";

describe("softwareFreelancePack", () => {
  it("defines the v0 final-package manifest", () => {
    expect(softwareFreelancePack.id).toBe("software-freelance");
    expect(softwareFreelancePack.agents.map((agent) => agent.id)).toEqual([
      "client-intake",
      "scope-pm",
      "software-architect",
      "builder",
      "reviewer-qa",
      "delivery"
    ]);
    expect(softwareFreelancePack.requiredFinalPackageFiles).toEqual(expect.arrayContaining([
      "client/project-summary.md",
      "client/handoff-notes.md",
      "client/user-guide.md",
      "planning/requirements.md",
      "technical/architecture.md",
      "review/qa-report.md",
      "app/package.json",
      "app/src/App.tsx"
    ]));
    expect(softwareFreelancePack.requiredTraceFiles).toEqual(expect.arrayContaining([
      "trace/events.jsonl",
      "trace/agent-messages.json",
      "trace/agent-actions.json",
      "trace/context-packages.json",
      "trace/context-eval.json",
      "trace/decisions.json",
      "trace/approvals.json",
      "trace/artifact-lineage.json"
    ]));
  });

  it.each([
    ["Build an inventory request system for a flower company", "Inventory Request Desk", "Inventory Request", "Pending"],
    ["Build a booking system for a barber shop", "Barber Booking Desk", "Booking", "Confirmed"],
    ["Build a clinic appointment system", "Clinic Appointment Desk", "Appointment", "Scheduled"],
    ["Build a restaurant reservation system", "Restaurant Reservation Desk", "Reservation", "Seated"],
    ["Build an equipment checkout system for a university club", "Club Equipment Checkout", "Checkout", "Overdue"]
  ])("infers distinct software freelance package content for %s", (goal, appName, entityName, status) => {
    const spec = softwareFreelancePack.inferDomainSpec(goal);

    expect(spec.appName).toBe(appName);
    expect(spec.primaryEntity.name).toBe(entityName);
    expect(spec.workflowStatuses).toContain(status);
  });

  it("exposes backwards-compatible domain inference metadata", () => {
    const result = softwareFreelancePack.inferDomainSpecResult?.("Build an inventory request system for a flower company");

    expect(result?.matchedPresetId).toBe("inventory-request");
    expect(result?.spec.appName).toBe("Inventory Request Desk");
    expect(result?.fallbackUsed).toBe(false);
    expect(result?.needsClarification).toBe(false);
  });

  it("keeps manifest owners tied to executable agent steps", () => {
    const agentIds = new Set(softwareFreelancePack.agents.map((agent) => agent.id));
    const stepOutputTypes = new Set(agentSteps.map((step) => step.outputType));
    const stepOwnerIds = new Set(agentSteps.map((step) => step.ownerAgentId));

    for (const manifestItem of softwareFreelancePack.artifactManifest) {
      expect(agentIds.has(manifestItem.ownerAgentId)).toBe(true);
      if (manifestItem.required) {
        expect(stepOutputTypes.has(manifestItem.type)).toBe(true);
      }
    }

    for (const agent of softwareFreelancePack.agents) {
      expect(stepOwnerIds.has(agent.id)).toBe(true);
    }
  });

  it("orders agent steps after their declared input artifacts", () => {
    const produced = new Set<string>();

    for (const step of agentSteps) {
      for (const requiredInput of step.requiredInputs) {
        expect(produced.has(requiredInput)).toBe(true);
      }
      produced.add(step.outputType);
    }
  });
});
