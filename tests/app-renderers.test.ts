import { describe, expect, it } from "vitest";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { renderGeneratedAppFiles } from "../src/templates/app.js";

describe("generated app renderers", () => {
  it.each([
    ["Build a booking system for a barber shop", "booking-lite", "Schedule, review"],
    ["Build an inventory request system for a flower company", "inventory-lite", "Track, review"],
    ["Build a student portal request tracker", "crud-workflow", "Create, review"],
  ])("renders %s through the %s archetype", (goal, archetype, summaryPhrase) => {
    const appSpec = appSpecFromDomainSpec(inferDomainSpec(goal));
    const files = renderGeneratedAppFiles({ runId: "renderer-test" }, appSpec);

    expect(appSpec.appArchetype).toBe(archetype);
    expect(files["app/src/App.tsx"]).toContain(summaryPhrase);
    expect(files["app/server.js"]).toContain(appSpec.primaryEntity.slug);
    expect(files[`app/data/${appSpec.primaryEntity.slug}.json`]).toContain(appSpec.workflow.initialStatus);
  });
});
