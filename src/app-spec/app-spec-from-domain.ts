import type { DomainSpec, ScreenSpec } from "../domain/domain-spec.js";
import type { AppScreenSpec, AppSpec, AppSummaryMetricSpec } from "./app-spec.js";

export function appSpecFromDomainSpec(domainSpec: DomainSpec): AppSpec {
  const statuses = domainSpec.workflowStatuses.length > 0 ? domainSpec.workflowStatuses : ["Requested"];
  const primaryEntity = {
    id: domainSpec.primaryEntity.slug,
    name: domainSpec.primaryEntity.name,
    pluralName: domainSpec.primaryEntity.pluralName,
    slug: domainSpec.primaryEntity.slug,
    titleField: domainSpec.primaryEntity.fields[0]?.name ?? "name",
    fields: domainSpec.primaryEntity.fields.map((field) => ({ ...field })),
  };

  return {
    schemaVersion: 1,
    sourceGoal: domainSpec.sourceGoal,
    appName: domainSpec.appName,
    appSlug: domainSpec.appSlug,
    appArchetype: "crud-workflow",
    domain: domainSpec.domain,
    primaryEntity,
    targetUsers: [...domainSpec.targetUsers],
    screens: domainSpec.screens.map(toAppScreenSpec),
    workflow: {
      statusField: "status",
      statuses,
      initialStatus: statuses[0] ?? "Requested",
      terminalStatuses: inferTerminalStatuses(statuses),
    },
    summaryMetrics: createSummaryMetrics(domainSpec.primaryEntity.pluralName, statuses),
    coreActions: [...domainSpec.coreActions],
    assumptions: [...domainSpec.assumptions],
    risks: [...domainSpec.risks],
    deferredFeatures: [],
    seedRecords: domainSpec.seedRecords.map((record) => ({ ...record })),
  };
}

// M2 should replace this adapter as the primary mock extraction path. For M1 it
// keeps the app renderer deterministic while preserving the current presets.
function toAppScreenSpec(screen: ScreenSpec, index: number): AppScreenSpec {
  return {
    id: uniqueScreenId(screen.name, index),
    name: screen.name,
    purpose: screen.purpose,
    kind: inferScreenKind(screen),
    actions: [...screen.actions],
  };
}

function inferScreenKind(screen: ScreenSpec): AppScreenSpec["kind"] {
  const text = `${screen.name} ${screen.purpose} ${screen.actions.join(" ")}`.toLowerCase();
  if (text.includes("dashboard") || text.includes("summary") || text.includes("metric")) {
    return "dashboard";
  }
  if (text.includes("create") || text.includes("new") || text.includes("intake") || text.includes("submit")) {
    return "create";
  }
  if (text.includes("detail") || text.includes("review")) {
    return "detail";
  }
  if (text.includes("status") || text.includes("queue") || text.includes("workflow")) {
    return "workflow";
  }
  return "list";
}

function createSummaryMetrics(pluralName: string, statuses: string[]): AppSummaryMetricSpec[] {
  const metrics: AppSummaryMetricSpec[] = [
    {
      id: "total-records",
      label: `Total ${pluralName.toLowerCase()}`,
      type: "total-records",
    },
  ];
  for (const status of statuses.slice(0, 3)) {
    metrics.push({
      id: `${slugify(status)}-records`,
      label: status,
      type: "status-count",
      status,
    });
  }
  return metrics;
}

function inferTerminalStatuses(statuses: string[]): string[] {
  const terminalWords = [
    "approved",
    "cancelled",
    "canceled",
    "closed",
    "completed",
    "delivered",
    "done",
    "fulfilled",
    "lost",
    "paid",
    "rejected",
    "resolved",
    "returned",
    "settled",
    "won",
  ];
  return statuses.filter((status) => terminalWords.some((word) => status.toLowerCase().includes(word)));
}

function uniqueScreenId(name: string, index: number): string {
  return slugify(name) || `screen-${index + 1}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
