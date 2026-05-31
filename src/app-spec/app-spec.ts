export type AppArchetype = "crud-workflow";
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
  deferredFeatures: string[];
  seedRecords: Array<Record<string, AppFieldValue>>;
}

// M1 intentionally models the existing deterministic single-entity CRUD/status app.
// Later milestones should add renderer-specific contracts here instead of widening
// this shape silently: booking-lite, inventory-lite, live extraction, acceptance
// scenarios, and multi-entity relations belong in M2-M7.
