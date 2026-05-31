import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import type { AppSpec } from "../src/app-spec/app-spec.js";
import { validateGeneratedApp } from "../src/core/generated-app-validation.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { renderGeneratedAppFiles } from "../src/templates/app.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("validateGeneratedApp", () => {
  it("passes the generated app shape emitted by the template renderer", async () => {
    const appSpec = validAppSpec();
    const finalPackageDir = await writeFinalPackage(renderGeneratedAppFiles({ runId: "test-run" }, appSpec));

    const result = await validateGeneratedApp(finalPackageDir, appSpec);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([
      expect.objectContaining({ id: "shape.required-files", status: "passed" }),
      expect.objectContaining({ id: "shape.package-json-valid", status: "passed" }),
      expect.objectContaining({ id: "shape.package-scripts", status: "passed" }),
      expect.objectContaining({ id: "shape.readme-commands", status: "passed" }),
      expect.objectContaining({ id: "shape.api-routes", status: "passed" }),
      expect.objectContaining({ id: "spec.seed-data", status: "passed" }),
      expect.objectContaining({ id: "shape.ui-app-spec-terms", status: "passed" }),
      expect.objectContaining({ id: "spec.workflow-statuses", status: "passed" }),
    ]);
  });

  it("reports structured failures for malformed generated app output", async () => {
    const appSpec = validAppSpec();
    const files = renderGeneratedAppFiles({ runId: "test-run" }, appSpec);
    delete files["app/src/main.tsx"];
    files["app/package.json"] = "{";
    files["app/README.md"] = "# Missing run commands\n";
    files["app/server.js"] = `const config = { entitySlug: "${appSpec.primaryEntity.slug}" };\n`;
    files["app/src/App.tsx"] = "export default function App() { return null; }\n";
    files[`app/data/${appSpec.primaryEntity.slug}.json`] = "{";
    const finalPackageDir = await writeFinalPackage(files);

    const result = await validateGeneratedApp(finalPackageDir, appSpec);

    expect(result.ok).toBe(false);
    expect(statusById(result)).toMatchObject({
      "shape.required-files": "failed",
      "shape.package-json-valid": "failed",
      "shape.package-scripts": "failed",
      "shape.readme-commands": "failed",
      "shape.api-routes": "failed",
      "spec.seed-data": "failed",
      "shape.ui-app-spec-terms": "failed",
      "spec.workflow-statuses": "failed",
    });
    expect(messageById(result, "shape.required-files")).toContain("app/src/main.tsx");
    expect(messageById(result, "shape.api-routes")).toContain("health");
    expect(messageById(result, "shape.ui-app-spec-terms")).toContain(appSpec.appName);
  });

  it("checks expected package scripts after package.json parses", async () => {
    const appSpec = validAppSpec();
    const files = renderGeneratedAppFiles({ runId: "test-run" }, appSpec);
    files["app/package.json"] = `${JSON.stringify({ scripts: { "dev:api": "node server.js", build: "vite build" } }, null, 2)}\n`;
    const finalPackageDir = await writeFinalPackage(files);

    const result = await validateGeneratedApp(finalPackageDir, appSpec);

    expect(statusById(result)).toMatchObject({
      "shape.package-json-valid": "passed",
      "shape.package-scripts": "failed",
    });
    expect(messageById(result, "shape.package-scripts")).toContain("dev:web");
  });
});

function validAppSpec(): AppSpec {
  return appSpecFromDomainSpec(inferDomainSpec("Build an inventory request system for a flower company"));
}

async function writeFinalPackage(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agentsim-generated-app-validation-"));
  tempDirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const filePath = join(root, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
    }),
  );
  return root;
}

function statusById(result: Awaited<ReturnType<typeof validateGeneratedApp>>): Record<string, string> {
  return Object.fromEntries(result.checks.map((check) => [check.id, check.status]));
}

function messageById(result: Awaited<ReturnType<typeof validateGeneratedApp>>, id: string): string {
  return result.checks.find((check) => check.id === id)?.message ?? "";
}
