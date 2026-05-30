export type FieldType = "text" | "number" | "date" | "datetime" | "select" | "textarea";

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

export interface EntitySpec {
  name: string;
  pluralName: string;
  slug: string;
  fields: FieldSpec[];
}

export interface ScreenSpec {
  name: string;
  purpose: string;
  actions: string[];
}

export interface DomainSpec {
  sourceGoal: string;
  appName: string;
  appSlug: string;
  domain: string;
  primaryEntity: EntitySpec;
  supportingEntities: EntitySpec[];
  targetUsers: string[];
  screens: ScreenSpec[];
  workflowStatuses: string[];
  coreActions: string[];
  approvalPoints: string[];
  generatedArtifactTypes: string[];
  assumptions: string[];
  risks: string[];
  seedRecords: Array<Record<string, string | number>>;
}

