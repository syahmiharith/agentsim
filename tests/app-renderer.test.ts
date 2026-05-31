import { afterEach, describe, expect, it, vi } from "vitest";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import type { AppSpec } from "../src/app-spec/app-spec.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { renderGeneratedAppFiles } from "../src/templates/app.js";
import { crudWorkflowRenderer, renderCrudWorkflowAppFiles } from "../src/templates/renderers/crud-workflow.js";

describe("generated app renderer boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes domain specs and AppSpecs through the crud-workflow renderer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T00:00:00.000Z"));

    const domainSpec = inferDomainSpec("Build an inventory request system for a flower company");
    const appSpec = appSpecFromDomainSpec(domainSpec);
    const context = { runId: "runs/test-run" };
    const renderedByCrudRenderer = renderCrudWorkflowAppFiles(context, appSpec);

    expect(crudWorkflowRenderer.archetype).toBe("crud-workflow");
    expect(renderGeneratedAppFiles(context, appSpec)).toEqual(renderedByCrudRenderer);
    expect(renderGeneratedAppFiles(context, domainSpec)).toEqual(renderedByCrudRenderer);
    expect(Object.keys(renderedByCrudRenderer)).toEqual([
      "app/package.json",
      "app/index.html",
      "app/tsconfig.json",
      "app/vite.config.ts",
      "app/server.js",
      `app/data/${appSpec.primaryEntity.slug}.json`,
      "app/src/main.tsx",
      "app/src/App.tsx",
      "app/src/styles.css",
      "app/README.md",
    ]);
  });

  it("fails unsupported AppSpec archetypes at the renderer dispatch boundary", () => {
    const appSpec = appSpecFromDomainSpec(inferDomainSpec("Build a booking system for a barber shop"));
    const unsupportedSpec = { ...appSpec, appArchetype: "dashboard" } as unknown as AppSpec;

    expect(() => renderGeneratedAppFiles({ runId: "test-run" }, unsupportedSpec)).toThrow("Unsupported app archetype: dashboard");
  });
});
