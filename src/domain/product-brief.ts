import type { AppArchetype } from "../app-spec/app-spec.js";
import { validateDomainSpec } from "./domain-validation.js";
import type { DomainSpec, EntitySpec, FieldSpec, FieldType, ScreenSpec } from "./domain-spec.js";

export interface ProductWorkflowSpec {
  name: string;
  statuses: string[];
  initialStatus?: string;
  terminalStatuses?: string[];
}

export interface ProductBrief {
  schemaVersion: 1;
  sourceGoal: string;
  appName: string;
  appArchetype: AppArchetype;
  domain: string;
  targetUsers: string[];
  primaryJobs: string[];
  entities: EntitySpec[];
  workflows: ProductWorkflowSpec[];
  screens: ScreenSpec[];
  constraints: string[];
  assumptions: string[];
  risks: string[];
  unresolvedQuestions: string[];
  deferredFeatures: string[];
  seedRecords: Array<Record<string, string | number>>;
}

export interface ProductBriefParseResult {
  brief: ProductBrief;
  warnings: string[];
}

const archetypes = new Set<AppArchetype>(["crud-workflow", "booking-lite", "inventory-lite"]);
const fieldTypes = new Set<FieldType>(["text", "number", "date", "datetime", "select", "textarea"]);

export function productBriefFromDomainSpec(spec: DomainSpec): ProductBrief {
  return {
    schemaVersion: 1,
    sourceGoal: spec.sourceGoal,
    appName: spec.appName,
    appArchetype: spec.appArchetype ?? inferArchetype(`${spec.sourceGoal} ${spec.domain} ${spec.primaryEntity.name}`),
    domain: spec.domain,
    targetUsers: [...spec.targetUsers],
    primaryJobs: [...spec.coreActions],
    entities: [cloneEntity(spec.primaryEntity), ...spec.supportingEntities.map(cloneEntity)],
    workflows: [
      {
        name: `${spec.primaryEntity.name} workflow`,
        statuses: [...spec.workflowStatuses],
        initialStatus: spec.workflowStatuses[0],
        terminalStatuses: inferTerminalStatuses(spec.workflowStatuses),
      },
    ],
    screens: spec.screens.map((screen) => ({ ...screen, actions: [...screen.actions] })),
    constraints: [...spec.approvalPoints],
    assumptions: [...spec.assumptions],
    risks: [...spec.risks],
    unresolvedQuestions: [...(spec.unresolvedQuestions ?? [])],
    deferredFeatures: mergeStrings([...(spec.deferredFeatures ?? []), ...inferDeferredFeatures(spec.sourceGoal)]),
    seedRecords: spec.seedRecords.map((record) => ({ ...record })),
  };
}

export function productBriefToDomainSpec(brief: ProductBrief, sourceGoal = brief.sourceGoal): DomainSpec {
  const primaryEntity = cloneEntity(brief.entities[0] ?? fallbackEntity());
  const workflow = brief.workflows[0];
  const statuses = workflow?.statuses?.length ? workflow.statuses : ["Requested", "In Progress", "Completed"];
  const spec: DomainSpec = {
    sourceGoal,
    appName: brief.appName,
    appSlug: slugify(brief.appName) || "generated-app",
    appArchetype: brief.appArchetype,
    domain: brief.domain,
    primaryEntity,
    supportingEntities: brief.entities.slice(1).map(cloneEntity),
    targetUsers: brief.targetUsers.length ? [...brief.targetUsers] : ["operator"],
    screens: brief.screens.length ? brief.screens.map((screen) => ({ ...screen, actions: [...screen.actions] })) : defaultScreens(primaryEntity),
    workflowStatuses: statuses,
    coreActions: brief.primaryJobs.length ? [...brief.primaryJobs] : defaultActions(primaryEntity),
    approvalPoints: brief.constraints,
    generatedArtifactTypes: [
      "proposal",
      "project-summary",
      "requirements",
      "scope",
      "assumptions",
      "timeline",
      "risks",
      "architecture",
      "database-schema",
      "api-plan",
      "task-breakdown",
      "app",
      "qa-report",
      "code-review",
      "known-issues",
      "handoff-notes",
      "user-guide",
    ],
    assumptions: brief.assumptions.length ? [...brief.assumptions] : ["Local persistence is enough for a first review."],
    risks: brief.risks.length ? [...brief.risks] : ["Production hardening is outside this prototype."],
    unresolvedQuestions: [...brief.unresolvedQuestions],
    deferredFeatures: mergeStrings([...brief.deferredFeatures, ...inferDeferredFeatures(sourceGoal)]),
    seedRecords: brief.seedRecords.map((record) => normalizeSeedRecord(record, primaryEntity, statuses[0] ?? "Requested")),
  };

  const validation = validateDomainSpec(spec);
  if (!validation.ok) {
    throw new Error(`ProductBrief produced invalid DomainSpec: ${validation.failures.join("; ")}`);
  }
  return spec;
}

export function parseProductBriefJson(content: string, sourceGoal: string): ProductBriefParseResult {
  const parsed = parseJsonObject(content);
  const warnings: string[] = [];
  const appName = readString(parsed.appName, "appName");
  const entities = readEntities(parsed.entities);
  const workflows = readWorkflows(parsed.workflows);
  const explicitArchetype =
    typeof parsed.appArchetype === "string" && archetypes.has(parsed.appArchetype as AppArchetype) ? (parsed.appArchetype as AppArchetype) : undefined;
  if (parsed.appArchetype !== undefined && !explicitArchetype) {
    warnings.push(`Unsupported appArchetype ${String(parsed.appArchetype)}; inferred a supported archetype.`);
  }

  const brief: ProductBrief = {
    schemaVersion: parsed.schemaVersion === 1 ? 1 : 1,
    sourceGoal,
    appName,
    appArchetype: explicitArchetype ?? inferArchetype(`${sourceGoal} ${appName} ${readString(parsed.domain, "domain")}`),
    domain: readString(parsed.domain, "domain"),
    targetUsers: readStringArray(parsed.targetUsers, "targetUsers"),
    primaryJobs: readStringArray(parsed.primaryJobs, "primaryJobs"),
    entities,
    workflows,
    screens: readScreens(parsed.screens),
    constraints: readOptionalStringArray(parsed.constraints),
    assumptions: readStringArray(parsed.assumptions, "assumptions"),
    risks: readOptionalStringArray(parsed.risks),
    unresolvedQuestions: readOptionalStringArray(parsed.unresolvedQuestions),
    deferredFeatures: mergeStrings([...readOptionalStringArray(parsed.deferredFeatures), ...inferDeferredFeatures(sourceGoal)]),
    seedRecords: readSeedRecords(parsed.seedRecords, entities[0], workflows[0]),
  };

  validateProductBrief(brief);
  return { brief, warnings };
}

export function validateProductBrief(brief: ProductBrief): void {
  const failures: string[] = [];
  if (brief.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (!brief.appName.trim()) failures.push("appName must not be empty");
  if (!archetypes.has(brief.appArchetype)) failures.push("appArchetype is unsupported");
  if (!brief.domain.trim()) failures.push("domain must not be empty");
  if (brief.entities.length === 0) failures.push("entities must not be empty");
  if (brief.workflows.length === 0) failures.push("workflows must not be empty");
  if (brief.screens.length === 0) failures.push("screens must not be empty");
  for (const entity of brief.entities) {
    if (!entity.name.trim() || !entity.pluralName.trim() || !entity.slug.trim()) failures.push("entities must include name, pluralName, and slug");
    if (entity.fields.length === 0) failures.push(`entity ${entity.name} must include fields`);
  }
  if (failures.length > 0) {
    throw new Error(`ProductBrief validation failed: ${failures.join("; ")}`);
  }
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    if (!isRecord(parsed)) {
      throw new Error("response must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`ProductBrief extraction returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

function readEntities(value: unknown): EntitySpec[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ProductBrief entities must be a non-empty array.");
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`ProductBrief entities.${index} must be an object.`);
    }
    const name = readString(item.name, `entities.${index}.name`);
    const fields = readFields(item.fields, `entities.${index}.fields`);
    return {
      name,
      pluralName: typeof item.pluralName === "string" && item.pluralName.trim() ? item.pluralName.trim() : `${name}s`,
      slug: safeSlug(typeof item.slug === "string" ? item.slug : name),
      fields,
    };
  });
}

function readFields(value: unknown, path: string): FieldSpec[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`ProductBrief ${path} must be a non-empty array.`);
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`ProductBrief ${path}.${index} must be an object.`);
    }
    const name = safeFieldName(readString(item.name, `${path}.${index}.name`));
    if (seen.has(name)) {
      throw new Error(`ProductBrief ${path} contains duplicate field ${name}.`);
    }
    seen.add(name);
    const type = fieldTypes.has(item.type as FieldType) ? (item.type as FieldType) : "text";
    const field: FieldSpec = {
      name,
      label: readString(item.label, `${path}.${index}.label`),
      type,
      required: item.required === undefined ? true : Boolean(item.required),
    };
    if (type === "select") {
      field.options = readStringArray(item.options, `${path}.${index}.options`);
    }
    return field;
  });
}

function readWorkflows(value: unknown): ProductWorkflowSpec[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ProductBrief workflows must be a non-empty array.");
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`ProductBrief workflows.${index} must be an object.`);
    }
    const statuses = readStringArray(item.statuses, `workflows.${index}.statuses`);
    return {
      name: readString(item.name, `workflows.${index}.name`),
      statuses,
      initialStatus: typeof item.initialStatus === "string" && statuses.includes(item.initialStatus) ? item.initialStatus : statuses[0],
      terminalStatuses: readOptionalStringArray(item.terminalStatuses).filter((status) => statuses.includes(status)),
    };
  });
}

function readScreens(value: unknown): ScreenSpec[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ProductBrief screens must be a non-empty array.");
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`ProductBrief screens.${index} must be an object.`);
    }
    return {
      name: readString(item.name, `screens.${index}.name`),
      purpose: readString(item.purpose, `screens.${index}.purpose`),
      actions: readStringArray(item.actions, `screens.${index}.actions`),
    };
  });
}

function readSeedRecords(value: unknown, entity: EntitySpec, workflow: ProductWorkflowSpec): Array<Record<string, string | number>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((record) => normalizeSeedRecord(record, entity, workflow.initialStatus ?? workflow.statuses[0] ?? "Requested"));
}

function normalizeSeedRecord(record: Record<string, unknown>, entity: EntitySpec, initialStatus: string): Record<string, string | number> {
  const output: Record<string, string | number> = {};
  for (const field of entity.fields) {
    const value = record[field.name];
    if (field.type === "number") {
      output[field.name] = typeof value === "number" ? value : Number(value ?? 1) || 1;
    } else if (typeof value === "string" || typeof value === "number") {
      output[field.name] = value;
    } else if (field.type === "select") {
      output[field.name] = field.options?.[0] ?? "";
    } else {
      output[field.name] = "";
    }
  }
  output.status = typeof record.status === "string" ? record.status : initialStatus;
  return output;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`ProductBrief ${path} must be a non-empty string.`);
  }
  return value.trim();
}

function readStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error(`ProductBrief ${path} must be a non-empty string array.`);
  }
  return value.map((item) => item.trim());
}

function readOptionalStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function cloneEntity(entity: EntitySpec): EntitySpec {
  return {
    ...entity,
    fields: entity.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })),
  };
}

function fallbackEntity(): EntitySpec {
  return {
    name: "Request",
    pluralName: "Requests",
    slug: "requests",
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "details", label: "Details", type: "textarea", required: false },
    ],
  };
}

function defaultScreens(entity: EntitySpec): ScreenSpec[] {
  return [
    { name: `New ${entity.name}`, purpose: `Create ${entity.pluralName.toLowerCase()}.`, actions: [`Create ${entity.name.toLowerCase()}`] },
    { name: `${entity.name} Queue`, purpose: `Review and update ${entity.pluralName.toLowerCase()}.`, actions: ["Filter by status", "Update status"] },
  ];
}

function defaultActions(entity: EntitySpec): string[] {
  return [`Create ${entity.name.toLowerCase()}`, `Review ${entity.pluralName.toLowerCase()}`, "Update status"];
}

function inferArchetype(text: string): AppArchetype {
  const normalized = text.toLowerCase();
  if (/\b(booking|appointment|reservation|schedule|class|shift|signup)\b/.test(normalized)) return "booking-lite";
  if (/\b(inventory|checkout|rental|stock|equipment|item)\b/.test(normalized)) return "inventory-lite";
  return "crud-workflow";
}

function inferTerminalStatuses(statuses: string[]): string[] {
  return statuses.filter((status) => /\b(done|complete|completed|closed|resolved|cancelled|canceled|returned|won|lost)\b/i.test(status));
}

function inferDeferredFeatures(text: string): string[] {
  const normalized = text.toLowerCase();
  const deferred: string[] = [];
  if (/\b(auth|login|sign in|permission|role-based|rbac)\b/.test(normalized)) {
    deferred.push("Authentication and authorization require a later dedicated renderer capability.");
  }
  if (/\b(payment|checkout payment|stripe|invoice|billing)\b/.test(normalized)) {
    deferred.push("Payments and billing integrations are outside the local prototype.");
  }
  if (/\b(deploy|hosted|production|public url|vercel|render|fly\.io)\b/.test(normalized)) {
    deferred.push("Hosted deployment and production hardening are deferred.");
  }
  if (/\b(email|sms|notification|notify|webhook)\b/.test(normalized)) {
    deferred.push("Notifications and outbound integrations are deferred.");
  }
  if (/\b(calendar sync|google calendar|outlook|ical)\b/.test(normalized)) {
    deferred.push("External calendar sync is deferred; booking-lite only tracks local scheduling fields.");
  }
  if (/\b(postgres|supabase|mysql|sqlite|database)\b/.test(normalized)) {
    deferred.push("Production database persistence is deferred; the prototype uses local JSON storage.");
  }
  return deferred;
}

function mergeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function safeSlug(value: string): string {
  return slugify(value) || "items";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function safeFieldName(value: string): string {
  const camel = value
    .trim()
    .replace(/[^A-Za-z0-9_$]+(.)/g, (_match, char: string) => char.toUpperCase())
    .replace(/[^A-Za-z0-9_$]/g, "");
  const normalized = camel.charAt(0).toLowerCase() + camel.slice(1);
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `field${normalized}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
