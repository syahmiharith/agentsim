import { describe, expect, it } from "vitest";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import type { AppSpec } from "../src/app-spec/app-spec.js";
import { validateAppSpec } from "../src/app-spec/app-spec-validation.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";

describe("AppSpec M1", () => {
  it("derives a valid single-entity AppSpec from existing presets", () => {
    const domainSpec = inferDomainSpec("Build an inventory request system for a flower company");
    const appSpec = appSpecFromDomainSpec(domainSpec);

    expect(validateAppSpec(appSpec)).toEqual({ ok: true, failures: [] });
    expect(appSpec.appArchetype).toBe("inventory-lite");
    expect(appSpec.appName).toBe(domainSpec.appName);
    expect(appSpec.primaryEntity.name).toBe(domainSpec.primaryEntity.name);
    expect(appSpec.primaryEntity.fields).toEqual(domainSpec.primaryEntity.fields);
    expect(appSpec.workflow.statuses).toEqual(domainSpec.workflowStatuses);
    expect(appSpec.seedRecords).toEqual(domainSpec.seedRecords);
  });

  it("rejects duplicate fields", () => {
    const appSpec = validAppSpec();
    appSpec.primaryEntity.fields.push({ ...appSpec.primaryEntity.fields[0] });

    expect(validateAppSpec(appSpec).failures).toContain("primaryEntity.fields contains duplicate field name: itemName");
  });

  it("rejects unsafe slugs", () => {
    const appSpec = validAppSpec();
    appSpec.appSlug = "Bad Slug";
    appSpec.primaryEntity.slug = "../requests";

    const failures = validateAppSpec(appSpec).failures;
    expect(failures).toContain("appSlug must use lowercase letters, numbers, and hyphens");
    expect(failures).toContain("primaryEntity.slug must use lowercase letters, numbers, and hyphens");
  });

  it("rejects invalid select options", () => {
    const appSpec = validAppSpec();
    const selectField = appSpec.primaryEntity.fields.find((field) => field.type === "select");
    if (!selectField) {
      throw new Error("fixture must include select field");
    }
    selectField.options = ["Urgent", "Urgent"];

    expect(validateAppSpec(appSpec).failures).toContain(`primaryEntity.fields.${selectField.name}.options contains duplicate values`);
  });

  it("rejects invalid seed records", () => {
    const appSpec = validAppSpec();
    appSpec.seedRecords = [
      {
        itemName: "",
        priority: "Not a priority",
        quantity: "many",
        status: "Imaginary",
      },
    ];

    const failures = validateAppSpec(appSpec).failures;
    expect(failures).toContain("seedRecords.0.itemName is required");
    expect(failures).toContain("seedRecords.0.quantity must be a number");
    expect(failures).toContain("seedRecords.0.priority must be a valid select option");
    expect(failures).toContain("seedRecords.0.status is not a valid workflow status");
  });

  it("rejects a missing initial workflow status", () => {
    const appSpec = validAppSpec();
    appSpec.workflow.initialStatus = "Missing";

    expect(validateAppSpec(appSpec).failures).toContain("workflow.initialStatus must be one of workflow.statuses");
  });

  it("requires list, create, and status acceptance scenarios", () => {
    const appSpec = validAppSpec();
    appSpec.acceptanceScenarios = [
      {
        id: "list-only",
        name: "List records",
        steps: ["Open list"],
        expectedOutcome: "Records are listed",
      },
    ];

    const failures = validateAppSpec(appSpec).failures;
    expect(failures).toContain("acceptanceScenarios must cover create behavior");
    expect(failures).toContain("acceptanceScenarios must cover status behavior");
  });

  it("carries unresolved questions and deferred features from DomainSpec", () => {
    const domainSpec = inferDomainSpec("Build an inventory request system for a flower company");
    domainSpec.unresolvedQuestions = ["Who approves urgent requests?"];
    domainSpec.deferredFeatures = ["Supplier sync"];

    const appSpec = appSpecFromDomainSpec(domainSpec);

    expect(appSpec.unresolvedQuestions).toEqual(["Who approves urgent requests?"]);
    expect(appSpec.deferredFeatures).toEqual(["Supplier sync"]);
  });

  it.each(["crud-workflow", "booking-lite", "inventory-lite"] as const)("accepts %s AppSpec archetype", (appArchetype) => {
    const appSpec = validAppSpec();
    appSpec.appArchetype = appArchetype;

    expect(validateAppSpec(appSpec)).toEqual({ ok: true, failures: [] });
  });

  it("rejects unsupported app archetypes", () => {
    const appSpec = validAppSpec();
    appSpec.appArchetype = "custom" as typeof appSpec.appArchetype;

    expect(validateAppSpec(appSpec).failures).toContain("appArchetype must be one of: crud-workflow, booking-lite, inventory-lite");
  });
});

function validAppSpec(): AppSpec {
  return structuredClone(appSpecFromDomainSpec(inferDomainSpec("Build an inventory request system for a flower company")));
}
