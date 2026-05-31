import type { AppArchetype, AppSpec } from "../../app-spec/app-spec.js";

export interface GeneratedAppRenderContext {
  runId: string;
}

export interface GeneratedAppRenderer<TSpec extends AppSpec = AppSpec> {
  archetype: AppArchetype;
  renderFiles(context: GeneratedAppRenderContext, spec: TSpec): Record<string, string>;
}
