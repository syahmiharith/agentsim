import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSpec } from "../app-spec/app-spec.js";

export interface GeneratedAppValidationCheck {
  id: string;
  status: "passed" | "failed";
  message: string;
}

export interface GeneratedAppValidation {
  schemaVersion: 1;
  ok: boolean;
  message: string;
  checks: GeneratedAppValidationCheck[];
}

export async function validateGeneratedApp(finalPackageDir: string, appSpec: AppSpec): Promise<GeneratedAppValidation> {
  const checks: GeneratedAppValidationCheck[] = [];
  const files = await readGeneratedFiles(finalPackageDir, appSpec);

  checks.push(requiredFilesCheck(files));
  checks.push(readmeCommandsCheck(files));
  checks.push(packageScriptsCheck(files));
  checks.push(apiRoutesCheck(files, appSpec));
  checks.push(uiTermsCheck(files, appSpec));
  checks.push(workflowStatusesCheck(files, appSpec));
  checks.push(seedDataCheck(files, appSpec));

  const passed = checks.filter((check) => check.status === "passed").length;
  const ok = checks.every((check) => check.status === "passed");
  return {
    schemaVersion: 1,
    ok,
    message: ok
      ? `Generated app validation passed ${passed}/${checks.length} checks.`
      : `Generated app validation failed ${checks.length - passed}/${checks.length} checks.`,
    checks,
  };
}

async function readGeneratedFiles(finalPackageDir: string, appSpec: AppSpec): Promise<Record<string, string | undefined>> {
  const relativePaths = [
    "app/package.json",
    "app/README.md",
    "app/server.js",
    "app/src/App.tsx",
    "app/src/main.tsx",
    `app/data/${appSpec.primaryEntity.slug}.json`,
  ];
  const files: Record<string, string | undefined> = {};
  for (const relativePath of relativePaths) {
    try {
      files[relativePath] = await readFile(join(finalPackageDir, relativePath), "utf8");
    } catch {
      files[relativePath] = undefined;
    }
  }
  return files;
}

function requiredFilesCheck(files: Record<string, string | undefined>): GeneratedAppValidationCheck {
  const missing = Object.entries(files)
    .filter(([, content]) => content === undefined)
    .map(([path]) => path);
  return missing.length === 0
    ? passed("shape.required-files", "Generated app required files are present.")
    : failed("shape.required-files", `Missing generated app files: ${missing.join(", ")}`);
}

function readmeCommandsCheck(files: Record<string, string | undefined>): GeneratedAppValidationCheck {
  const readme = files["app/README.md"] ?? "";
  const requiredCommands = ["pnpm install", "pnpm dev:api", "pnpm dev:web", "pnpm build"];
  const missing = requiredCommands.filter((command) => !readme.includes(command));
  return missing.length === 0
    ? passed("shape.readme-commands", "Generated app README documents install, dev, and build commands.")
    : failed("shape.readme-commands", `Generated app README is missing commands: ${missing.join(", ")}`);
}

function packageScriptsCheck(files: Record<string, string | undefined>): GeneratedAppValidationCheck {
  try {
    const packageJson = JSON.parse(files["app/package.json"] ?? "") as { scripts?: Record<string, unknown> };
    const scripts = packageJson.scripts ?? {};
    const missing = ["dev:api", "dev:web", "build"].filter((script) => typeof scripts[script] !== "string" || scripts[script].length === 0);
    return missing.length === 0
      ? passed("shape.package-scripts", "Generated app package.json includes required scripts.")
      : failed("shape.package-scripts", `Generated app package.json is missing scripts: ${missing.join(", ")}`);
  } catch {
    return failed("shape.package-scripts", "Generated app package.json is not valid JSON.");
  }
}

function apiRoutesCheck(files: Record<string, string | undefined>, appSpec: AppSpec): GeneratedAppValidationCheck {
  const server = files["app/server.js"] ?? "";
  const requiredTerms = [
    "/api/health",
    `"/api/" + config.entitySlug`,
    `config.entitySlug + "/([^/]+)/status$"`,
    appSpec.primaryEntity.slug,
    'request.method === "GET"',
    'request.method === "POST"',
    'request.method === "PATCH"',
  ];
  const missing = requiredTerms.filter((term) => !server.includes(term));
  return missing.length === 0
    ? passed("shape.api-routes", "Generated app API routes are present.")
    : failed("shape.api-routes", `Generated app server is missing route terms: ${missing.join(", ")}`);
}

function uiTermsCheck(files: Record<string, string | undefined>, appSpec: AppSpec): GeneratedAppValidationCheck {
  const app = files["app/src/App.tsx"] ?? "";
  const requiredTerms = [
    appSpec.appName,
    appSpec.domain,
    appSpec.primaryEntity.name,
    appSpec.primaryEntity.pluralName,
    ...appSpec.primaryEntity.fields.map((field) => field.label),
    ...appSpec.screens.map((screen) => screen.name),
  ];
  const missing = unique(requiredTerms).filter((term) => !app.includes(term));
  return missing.length === 0
    ? passed("shape.ui-app-spec-terms", "Generated UI includes AppSpec names, fields, and screens.")
    : failed("shape.ui-app-spec-terms", `Generated UI is missing AppSpec terms: ${missing.join(", ")}`);
}

function workflowStatusesCheck(files: Record<string, string | undefined>, appSpec: AppSpec): GeneratedAppValidationCheck {
  const app = files["app/src/App.tsx"] ?? "";
  const server = files["app/server.js"] ?? "";
  const missing = appSpec.workflow.statuses.filter((status) => !app.includes(status) || !server.includes(status));
  return missing.length === 0
    ? passed("spec.workflow-statuses", "Generated UI and API include all AppSpec workflow statuses.")
    : failed("spec.workflow-statuses", `Generated app is missing workflow statuses: ${missing.join(", ")}`);
}

function seedDataCheck(files: Record<string, string | undefined>, appSpec: AppSpec): GeneratedAppValidationCheck {
  const path = `app/data/${appSpec.primaryEntity.slug}.json`;
  try {
    const records = JSON.parse(files[path] ?? "") as unknown;
    if (!Array.isArray(records)) {
      return failed("spec.seed-data", "Generated seed data must be an array.");
    }
    const missingStatuses = records.filter((record) => typeof record !== "object" || record === null || !("status" in record)).length;
    if (missingStatuses > 0) {
      return failed("spec.seed-data", "Generated seed data records must include status.");
    }
    return passed("spec.seed-data", `Generated seed data parsed ${records.length} records.`);
  } catch {
    return failed("spec.seed-data", "Generated seed data is not valid JSON.");
  }
}

function passed(id: string, message: string): GeneratedAppValidationCheck {
  return { id, status: "passed", message };
}

function failed(id: string, message: string): GeneratedAppValidationCheck {
  return { id, status: "failed", message };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
