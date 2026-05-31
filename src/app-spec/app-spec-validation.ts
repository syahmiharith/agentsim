import type { ValidationResult } from "../types.js";
import type { AppFieldSpec, AppSpec } from "./app-spec.js";

const fieldTypes = new Set<AppFieldSpec["type"]>(["text", "number", "date", "datetime", "select", "textarea"]);
const safeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const safeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fieldNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function validateAppSpec(spec: AppSpec): ValidationResult {
  const failures: string[] = [];

  if (spec.schemaVersion !== 1) {
    failures.push("schemaVersion must be 1");
  }
  if (spec.appArchetype !== "crud-workflow") {
    failures.push("appArchetype must be crud-workflow");
  }
  requireNonEmpty(spec.sourceGoal, "sourceGoal", failures);
  requireNonEmpty(spec.appName, "appName", failures);
  requireSafeSlug(spec.appSlug, "appSlug", failures);
  requireNonEmpty(spec.domain, "domain", failures);

  validatePrimaryEntity(spec, failures);
  validateScreens(spec, failures);
  validateWorkflow(spec, failures);
  validateSummaryMetrics(spec, failures);
  validateSeedRecords(spec, failures);
  validateStringArray(spec.targetUsers, "targetUsers", failures);
  validateStringArray(spec.coreActions, "coreActions", failures);
  validateStringArray(spec.assumptions, "assumptions", failures);
  validateStringArray(spec.risks, "risks", failures);
  validateStringArray(spec.deferredFeatures, "deferredFeatures", failures, { allowEmpty: true });

  return {
    ok: failures.length === 0,
    failures,
  };
}

function validatePrimaryEntity(spec: AppSpec, failures: string[]): void {
  const entity = spec.primaryEntity;
  if (!entity) {
    failures.push("primaryEntity is required");
    return;
  }

  requireSafeId(entity.id, "primaryEntity.id", failures);
  requireNonEmpty(entity.name, "primaryEntity.name", failures);
  requireNonEmpty(entity.pluralName, "primaryEntity.pluralName", failures);
  requireSafeSlug(entity.slug, "primaryEntity.slug", failures);
  requireNonEmpty(entity.titleField, "primaryEntity.titleField", failures);

  if (!Array.isArray(entity.fields) || entity.fields.length === 0) {
    failures.push("primaryEntity.fields must not be empty");
    return;
  }

  const fieldNames = new Set<string>();
  for (const field of entity.fields) {
    if (fieldNames.has(field.name)) {
      failures.push(`primaryEntity.fields contains duplicate field name: ${field.name}`);
    }
    fieldNames.add(field.name);

    if (!fieldNamePattern.test(field.name)) {
      failures.push(`primaryEntity.fields.${field.name || "unknown"} has invalid field name`);
    }
    requireNonEmpty(field.label, `primaryEntity.fields.${field.name}.label`, failures);
    if (!fieldTypes.has(field.type)) {
      failures.push(`primaryEntity.fields.${field.name}.type is invalid: ${field.type}`);
    }

    if (field.type === "select") {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        failures.push(`primaryEntity.fields.${field.name}.options must not be empty for select fields`);
      } else if (new Set(field.options).size !== field.options.length) {
        failures.push(`primaryEntity.fields.${field.name}.options contains duplicate values`);
      } else if (field.options.some((option) => typeof option !== "string" || option.trim().length === 0)) {
        failures.push(`primaryEntity.fields.${field.name}.options must contain non-empty strings`);
      }
    } else if (field.options && field.options.length > 0) {
      failures.push(`primaryEntity.fields.${field.name}.options is only supported for select fields`);
    }
  }

  if (!fieldNames.has(entity.titleField)) {
    failures.push("primaryEntity.titleField must reference a known field");
  }
}

function validateScreens(spec: AppSpec, failures: string[]): void {
  if (!Array.isArray(spec.screens) || spec.screens.length === 0) {
    failures.push("screens must not be empty");
    return;
  }

  const ids = new Set<string>();
  for (const [index, screen] of spec.screens.entries()) {
    if (ids.has(screen.id)) {
      failures.push(`screens contains duplicate id: ${screen.id}`);
    }
    ids.add(screen.id);
    requireSafeId(screen.id, `screens.${index}.id`, failures);
    requireNonEmpty(screen.name, `screens.${index}.name`, failures);
    requireNonEmpty(screen.purpose, `screens.${index}.purpose`, failures);
    if (!["create", "list", "detail", "dashboard", "workflow"].includes(screen.kind)) {
      failures.push(`screens.${index}.kind is invalid: ${screen.kind}`);
    }
    validateStringArray(screen.actions, `screens.${index}.actions`, failures);
  }
}

function validateWorkflow(spec: AppSpec, failures: string[]): void {
  const workflow = spec.workflow;
  if (!workflow) {
    failures.push("workflow is required");
    return;
  }
  if (workflow.statusField !== "status") {
    failures.push("workflow.statusField must be status");
  }
  validateStringArray(workflow.statuses, "workflow.statuses", failures);
  if (Array.isArray(workflow.statuses) && new Set(workflow.statuses).size !== workflow.statuses.length) {
    failures.push("workflow.statuses contains duplicate values");
  }
  requireNonEmpty(workflow.initialStatus, "workflow.initialStatus", failures);
  if (Array.isArray(workflow.statuses) && !workflow.statuses.includes(workflow.initialStatus)) {
    failures.push("workflow.initialStatus must be one of workflow.statuses");
  }
  validateStringArray(workflow.terminalStatuses, "workflow.terminalStatuses", failures, { allowEmpty: true });
  for (const status of workflow.terminalStatuses ?? []) {
    if (!workflow.statuses?.includes(status)) {
      failures.push(`workflow.terminalStatuses contains unknown status: ${status}`);
    }
  }
}

function validateSummaryMetrics(spec: AppSpec, failures: string[]): void {
  if (!spec.workflow || !Array.isArray(spec.workflow.statuses)) {
    return;
  }
  if (!Array.isArray(spec.summaryMetrics) || spec.summaryMetrics.length === 0) {
    failures.push("summaryMetrics must not be empty");
    return;
  }

  const ids = new Set<string>();
  for (const [index, metric] of spec.summaryMetrics.entries()) {
    if (ids.has(metric.id)) {
      failures.push(`summaryMetrics contains duplicate id: ${metric.id}`);
    }
    ids.add(metric.id);
    requireSafeId(metric.id, `summaryMetrics.${index}.id`, failures);
    requireNonEmpty(metric.label, `summaryMetrics.${index}.label`, failures);
    if (metric.type !== "total-records" && metric.type !== "status-count") {
      failures.push(`summaryMetrics.${index}.type is invalid: ${metric.type}`);
    }
    if (metric.type === "status-count") {
      requireNonEmpty(metric.status, `summaryMetrics.${index}.status`, failures);
      if (metric.status && !spec.workflow.statuses.includes(metric.status)) {
        failures.push(`summaryMetrics.${index}.status is not a workflow status`);
      }
    } else if (metric.status) {
      failures.push(`summaryMetrics.${index}.status is only supported for status-count metrics`);
    }
  }
}

function validateSeedRecords(spec: AppSpec, failures: string[]): void {
  if (!spec.primaryEntity || !Array.isArray(spec.primaryEntity.fields) || !spec.workflow || !Array.isArray(spec.workflow.statuses)) {
    return;
  }
  if (!Array.isArray(spec.seedRecords)) {
    failures.push("seedRecords must be an array");
    return;
  }

  const fieldMap = new Map(spec.primaryEntity.fields.map((field) => [field.name, field]));
  const allowedKeys = new Set([...fieldMap.keys(), spec.workflow.statusField]);
  const statuses = new Set(spec.workflow.statuses);

  for (const [index, record] of spec.seedRecords.entries()) {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      failures.push(`seedRecords.${index} must be an object`);
      continue;
    }

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
      if (key === spec.workflow.statusField) {
        if (typeof value !== "string" || !statuses.has(value)) {
          failures.push(`seedRecords.${index}.${key} is not a valid workflow status`);
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

function validateStringArray(value: string[] | undefined, path: string, failures: string[], options: { allowEmpty?: boolean } = {}): void {
  if (!Array.isArray(value)) {
    failures.push(`${path} must be an array`);
    return;
  }
  if (!options.allowEmpty && value.length === 0) {
    failures.push(`${path} must not be empty`);
  }
  if (value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    failures.push(`${path} must contain non-empty strings`);
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

function requireSafeId(value: string | undefined, path: string, failures: string[]): void {
  requireNonEmpty(value, path, failures);
  if (typeof value === "string" && !safeIdPattern.test(value)) {
    failures.push(`${path} must use lowercase letters, numbers, and hyphens`);
  }
}
