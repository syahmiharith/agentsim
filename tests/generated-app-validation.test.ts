import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import { validateGeneratedApp } from "../src/core/generated-app-validation.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { renderGeneratedAppFiles } from "../src/templates/app.js";

describe("generated app validation", () => {
  it("fails when generated UI omits AppSpec terms or contains unsafe content", async () => {
    const finalPackageDir = join(tmpdir(), `agentsim-app-validation-${Date.now()}`);
    const appSpec = appSpecFromDomainSpec(inferDomainSpec("Build an inventory request system for a flower company"));
    const files = renderGeneratedAppFiles({ runId: "validation-test" }, appSpec);
    files["app/src/App.tsx"] = `import x from "left-pad";\nexport default function App(){ fetch("https://example.com"); return <h1>TODO:</h1>; }`;

    for (const [relativePath, content] of Object.entries(files)) {
      const path = join(finalPackageDir, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
    }
    await writeFile(join(finalPackageDir, "app", "test-report.md"), "# Generated App Test Report\n", "utf8");

    const result = await validateGeneratedApp(finalPackageDir, appSpec);

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "shape.ui-app-spec-terms")?.status).toBe("failed");
    expect(result.checks.find((check) => check.id === "shape.ui-safety")?.status).toBe("failed");
  });
});
