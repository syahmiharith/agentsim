import type { AppArchetype, AppFieldType, AppScreenSpec } from "./app-spec.js";

export interface RendererCapabilityManifest {
  rendererId: AppArchetype;
  label: string;
  supportedScreenKinds: AppScreenSpec["kind"][];
  supportedFieldTypes: AppFieldType[];
  supportedActions: string[];
  supportedRuntimeChecks: string[];
  unsupportedFeatures: string[];
}

const commonScreenKinds: AppScreenSpec["kind"][] = ["create", "list", "detail", "dashboard", "workflow"];
const commonFieldTypes: AppFieldType[] = ["text", "number", "date", "datetime", "select", "textarea"];

export const rendererCapabilities: Record<AppArchetype, RendererCapabilityManifest> = {
  "crud-workflow": {
    rendererId: "crud-workflow",
    label: "CRUD workflow renderer",
    supportedScreenKinds: commonScreenKinds,
    supportedFieldTypes: commonFieldTypes,
    supportedActions: ["list", "create", "update-status"],
    supportedRuntimeChecks: ["node-check", "install", "build", "api-smoke"],
    unsupportedFeatures: ["authentication", "payments", "deployment", "external integrations", "multi-entity relations"],
  },
  "booking-lite": {
    rendererId: "booking-lite",
    label: "Booking lite renderer",
    supportedScreenKinds: commonScreenKinds,
    supportedFieldTypes: commonFieldTypes,
    supportedActions: ["list", "create", "update-status"],
    supportedRuntimeChecks: ["node-check", "install", "build", "api-smoke"],
    unsupportedFeatures: ["calendar sync", "resource conflict detection", "payments", "authentication", "multi-entity relations"],
  },
  "inventory-lite": {
    rendererId: "inventory-lite",
    label: "Inventory lite renderer",
    supportedScreenKinds: commonScreenKinds,
    supportedFieldTypes: commonFieldTypes,
    supportedActions: ["list", "create", "update-status"],
    supportedRuntimeChecks: ["node-check", "install", "build", "api-smoke"],
    unsupportedFeatures: ["warehouse accounting", "supplier sync", "barcode scanning", "payments", "multi-entity relations"],
  },
};

export function rendererCapabilityFor(archetype: AppArchetype): RendererCapabilityManifest {
  return rendererCapabilities[archetype];
}
