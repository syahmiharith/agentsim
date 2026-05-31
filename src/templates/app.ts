import { appSpecFromDomainSpec } from "../app-spec/app-spec-from-domain.js";
import type { AppSpec } from "../app-spec/app-spec.js";
import type { DomainSpec } from "../domain/domain-spec.js";
import type { Workspace, WorkspaceDriver } from "../types.js";
import { crudWorkflowRenderer } from "./renderers/crud-workflow.js";
import type { GeneratedAppRenderer } from "./renderers/types.js";

const appRenderers: GeneratedAppRenderer[] = [crudWorkflowRenderer];

export async function writeGeneratedApp(workspace: Workspace, driver: WorkspaceDriver, spec: DomainSpec): Promise<void> {
  for (const [path, content] of Object.entries(renderGeneratedAppFiles(workspace, appSpecFromDomainSpec(spec)))) {
    await driver.writeFile(workspace, path, content);
  }
}

export function renderGeneratedAppFiles(workspace: Pick<Workspace, "runId">, spec: AppSpec | DomainSpec): Record<string, string> {
  const appSpec = isAppSpec(spec) ? spec : appSpecFromDomainSpec(spec);
  const renderer = rendererFor(appSpec);
  return renderer.renderFiles({ runId: workspace.runId }, appSpec);
}

function isAppSpec(spec: AppSpec | DomainSpec): spec is AppSpec {
  return "schemaVersion" in spec && spec.schemaVersion === 1;
}

function rendererFor(spec: AppSpec): GeneratedAppRenderer {
  const appArchetype = spec.appArchetype as string | undefined;
  const renderer = appRenderers.find((candidate) => candidate.archetype === appArchetype);
  if (!renderer) {
    throw new Error(`Unsupported app archetype: ${appArchetype}`);
  }
  return renderer;
}
