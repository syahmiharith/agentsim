import type { ValidationResult } from "../types.js";
import type { DomainSpec, FieldSpec } from "./domain-spec.js";

const fieldTypes = new Set<FieldSpec["type"]>(["text", "number", "date", "datetime", "select", "textarea"]);
const safeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fieldNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const expectedArtifactTypes = new Set([
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
  "user-guide"
]);

export function validateDomainSpec(spec: DomainSpec): ValidationResult {
  const failures: string[] = [];

  requireNonEmpty(spec.sourceGoal, "sourceGoal", failures);
  requireNonEmpty(spec.appName, "appName", failures);
  requireSafeSlug(spec.appSlug, "appSlug", failures);
  requireNonEmpty(spec.domain, "domain", failures);

  validateEntity(spec.primaryEntity, "primaryEntity", failures);
  validateWorkflow(spec, failures);
  validateSeedRecords(spec, failures);
  validateGeneratedArtifactTypes(spec.generatedArtifactTypes, failures);
  validateOptionalStringArray(spec.unresolvedQuestions, "unresolvedQuestions", failures);
  validateOptionalStringArray(spec.deferredFeatures, "deferredFeatures", failures);

  return {
    ok: failures.length === 0,
    failures
  };
}

function validateOptionalStringArray(value: string[] | undefined, path: string, failures: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    failures.push(`${path} must be an array`);
    return;
  }
  if (value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    failures.push(`${path} must contain non-empty strings`);
  }
}

function validateEntity(entity: DomainSpec["primaryEntity"] | undefined, path: string, failures: string[]): void {
  if (!entity) {
    failures.push(`${path} is required`);
    return;
  }

  requireNonEmpty(entity.name, `${path}.name`, failures);
  requireNonEmpty(entity.pluralName, `${path}.pluralName`, failures);
  requireSafeSlug(entity.slug, `${path}.slug`, failures);

  if (!Array.isArray(entity.fields) || entity.fields.length === 0) {
    failures.push(`${path}.fields must not be empty`);
    return;
  }

  const fieldNames = new Set<string>();
  for (const field of entity.fields) {
    if (fieldNames.has(field.name)) {
      failures.push(`${path}.fields contains duplicate field name: ${field.name}`);
    }
    fieldNames.add(field.name);

    if (!fieldNamePattern.test(field.name)) {
      failures.push(`${path}.fields.${field.name || "unknown"} has invalid field name`);
    }
    requireNonEmpty(field.label, `${path}.fields.${field.name}.label`, failures);
    if (!fieldTypes.has(field.type)) {
      failures.push(`${path}.fields.${field.name}.type is invalid: ${field.type}`);
    }

    if (field.type === "select") {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        failures.push(`${path}.fields.${field.name}.options must not be empty for select fields`);
      } else if (new Set(field.options).size !== field.options.length) {
        failures.push(`${path}.fields.${field.name}.options contains duplicate values`);
      }
    } else if (field.options && field.options.length > 0) {
      failures.push(`${path}.fields.${field.name}.options is only supported for select fields`);
    }
  }
}

function validateWorkflow(spec: DomainSpec, failures: string[]): void {
  if (!Array.isArray(spec.workflowStatuses) || spec.workflowStatuses.length === 0) {
    failures.push("workflowStatuses must not be empty");
  } else if (new Set(spec.workflowStatuses).size !== spec.workflowStatuses.length) {
    failures.push("workflowStatuses contains duplicate values");
  }

  if (!Array.isArray(spec.coreActions) || spec.coreActions.length === 0) {
    failures.push("coreActions must not be empty");
  }

  if (!Array.isArray(spec.screens) || spec.screens.length === 0) {
    failures.push("screens must not be empty");
  } else {
    for (const [index, screen] of spec.screens.entries()) {
      requireNonEmpty(screen.name, `screens.${index}.name`, failures);
      requireNonEmpty(screen.purpose, `screens.${index}.purpose`, failures);
      if (!Array.isArray(screen.actions) || screen.actions.length === 0) {
        failures.push(`screens.${index}.actions must not be empty`);
      }
    }
  }
}

function validateSeedRecords(spec: DomainSpec, failures: string[]): void {
  if (!Array.isArray(spec.seedRecords)) {
    failures.push("seedRecords must be an array");
    return;
  }

  const fieldMap = new Map(spec.primaryEntity.fields.map((field) => [field.name, field]));
  const allowedKeys = new Set([...fieldMap.keys(), "status"]);
  const statuses = new Set(spec.workflowStatuses);

  for (const [index, record] of spec.seedRecords.entries()) {
    for (const field of spec.primaryEntity.fields.filter((candidate) => candidate.required)) {
      if (record[field.name] === undefined || record[field.name] === null || record[field.name] === "") {
        failures.push(`seedRecords.${index}.${field.name} is required`);
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (!allowedKeys.has(key)) {
        failures.push(`seedRecords.${index}.${key} is not a known field`);
        continue;
      }
      if (key === "status") {
        if (typeof value !== "string" || !statuses.has(value)) {
          failures.push(`seedRecords.${index}.status is not a valid workflow status`);
        }
        continue;
      }

      const field = fieldMap.get(key);
      if (!field) {
        continue;
      }
      if (field.type === "number" && typeof value !== "number") {
        failures.push(`seedRecords.${index}.${key} must be a number`);
      }
      if (field.type === "select" && (typeof value !== "string" || !field.options?.includes(value))) {
        failures.push(`seedRecords.${index}.${key} must be a valid select option`);
      }
      if ((field.type === "date" || field.type === "datetime") && typeof value !== "string") {
        failures.push(`seedRecords.${index}.${key} must be a string`);
      }
    }
  }
}

function validateGeneratedArtifactTypes(values: string[], failures: string[]): void {
  if (!Array.isArray(values) || values.length === 0) {
    failures.push("generatedArtifactTypes must not be empty");
    return;
  }
  if (new Set(values).size !== values.length) {
    failures.push("generatedArtifactTypes contains duplicate values");
  }
  for (const expected of expectedArtifactTypes) {
    if (!values.includes(expected)) {
      failures.push(`generatedArtifactTypes is missing expected artifact type: ${expected}`);
    }
  }
}

function requireNonEmpty(value: string | undefined, path: string, failures: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    failures.push(`${path} must not be empty`);
  }
}

function requireSafeSlug(value: string | undefined, path: string, failures: string[]): void {
  requireNonEmpty(value, path, failures);
  if (typeof value === "string" && !safeSlugPattern.test(value)) {
    failures.push(`${path} must use lowercase letters, numbers, and hyphens`);
  }
}
