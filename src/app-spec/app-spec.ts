export type AppArchetype = "crud-workflow" | "booking-lite" | "inventory-lite";
export type AppFieldType = "text" | "number" | "date" | "datetime" | "select" | "textarea";
export type AppFieldValue = string | number;

export interface AppFieldSpec {
  name: string;
  label: string;
  type: AppFieldType;
  required: boolean;
  options?: string[];
}

export interface AppEntitySpec {
  id: string;
  name: string;
  pluralName: string;
  slug: string;
  titleField: string;
  fields: AppFieldSpec[];
}

export interface AppScreenSpec {
  id: string;
  name: string;
  purpose: string;
  kind: "create" | "list" | "detail" | "dashboard" | "workflow";
  actions: string[];
}

export interface AppWorkflowSpec {
  statusField: "status";
  statuses: string[];
  initialStatus: string;
  terminalStatuses: string[];
}

export interface AppSummaryMetricSpec {
  id: string;
  label: string;
  type: "total-records" | "status-count";
  status?: string;
}

export interface AppAcceptanceScenarioSpec {
  id: string;
  name: string;
  steps: string[];
  expectedOutcome: string;
}

export interface AppSpec {
  schemaVersion: 1;
  sourceGoal: string;
  appName: string;
  appSlug: string;
  appArchetype: AppArchetype;
  domain: string;
  primaryEntity: AppEntitySpec;
  targetUsers: string[];
  screens: AppScreenSpec[];
  workflow: AppWorkflowSpec;
  summaryMetrics: AppSummaryMetricSpec[];
  coreActions: string[];
  assumptions: string[];
  risks: string[];
  unresolvedQuestions: string[];
  deferredFeatures: string[];
  acceptanceScenarios: AppAcceptanceScenarioSpec[];
  seedRecords: Array<Record<string, AppFieldValue>>;
}

// AppSpec is the controlled contract for generated local prototypes. Live mode
// may extract product intent, but app code and package/API shape stay inside
// deterministic renderer capabilities.
