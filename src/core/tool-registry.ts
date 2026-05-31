import type { ContextPolicy, ToolDefinition, ToolRiskLevel, ValidationResult } from "../types.js";
import { defaultTools } from "./tools.js";

export interface ToolManifest {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  provider: "builtin";
}

export interface ToolRegistry {
  schemaVersion: 1;
  tools: ToolManifest[];
}

export const builtInToolRegistry: ToolRegistry = {
  schemaVersion: 1,
  tools: defaultTools.map((tool) => toolManifestForDefinition(tool))
};

export function toolManifestForDefinition(tool: ToolDefinition<unknown, unknown>): ToolManifest {
  return {
    name: tool.name,
    description: tool.description,
    riskLevel: tool.riskLevel,
    requiresApproval: tool.requiresApproval,
    provider: "builtin"
  };
}

export function validateAllowedTools(policy: ContextPolicy, registry: ToolRegistry = builtInToolRegistry): ValidationResult {
  const knownTools = new Set(registry.tools.map((tool) => tool.name));
  const failures = policy.allowedTools
    .filter((toolName) => !knownTools.has(toolName))
    .map((toolName) => `Context policy references unknown tool ${toolName}`);
  return { ok: failures.length === 0, failures };
}
