import type { ModelProvider } from "../types.js";
import { parseProductBriefJson, type ProductBriefParseResult } from "./product-brief.js";

export interface ProductBriefExtractionResult extends ProductBriefParseResult {
  model: string;
  providerRequestId?: string;
}

export async function extractProductBriefWithModel(input: {
  goal: string;
  modelProvider: ModelProvider;
  abortSignal?: AbortSignal;
}): Promise<ProductBriefExtractionResult> {
  const response = await input.modelProvider.generate({
    system: [
      "You extract concise product requirements for Agentsim.",
      "Return strict JSON only. Do not wrap the JSON in Markdown.",
      "Do not include secrets, credentials, private prompts, production claims, auth, payments, deployment, or multi-entity implementation promises.",
    ].join(" "),
    prompt: renderProductBriefPrompt(input.goal),
    purpose: "product-brief-extraction",
    abortSignal: input.abortSignal,
  });
  const parsed = parseProductBriefJson(response.content, input.goal);
  return {
    ...parsed,
    model: response.model,
    providerRequestId: response.providerRequestId,
  };
}

function renderProductBriefPrompt(goal: string): string {
  return `Extract a simple local software prototype brief from this client request:

${goal}

Return exactly one JSON object with this shape:

{
  "schemaVersion": 1,
  "appName": "Short product name",
  "appArchetype": "crud-workflow | booking-lite | inventory-lite",
  "domain": "Plain English domain",
  "targetUsers": ["user role"],
  "primaryJobs": ["job the app helps complete"],
  "entities": [
    {
      "name": "Singular entity",
      "pluralName": "Plural entity",
      "slug": "lowercase-hyphen-or-plural-slug",
      "fields": [
        { "name": "camelCaseName", "label": "Human label", "type": "text | number | date | datetime | select | textarea", "required": true, "options": ["Only for select"] }
      ]
    }
  ],
  "workflows": [
    { "name": "Workflow name", "statuses": ["Requested", "In Progress", "Completed"], "initialStatus": "Requested", "terminalStatuses": ["Completed"] }
  ],
  "screens": [
    { "name": "Screen name", "purpose": "What the screen is for", "actions": ["User action"] }
  ],
  "constraints": ["Local prototype constraint"],
  "assumptions": ["Assumption"],
  "risks": ["Risk"],
  "unresolvedQuestions": ["Question that needs client confirmation"],
  "deferredFeatures": ["Unsupported requirement to defer"],
  "seedRecords": [
    { "fieldName": "Example value", "status": "Requested" }
  ]
}

Rules:
- Keep exactly one primary entity in entities[0]. Put extra entities only when needed for traceability, not implementation.
- Include 4 to 7 practical fields. Use datetime for appointments/reservations/shifts, number for quantities, select for short option sets.
- Use 3 to 5 statuses that fit the app archetype.
- Put missing client details in unresolvedQuestions instead of inventing precise rules.
- Mention unsupported multi-entity, payments, auth, deployment, notifications, integrations, calendars, or production database needs in deferredFeatures instead of implying implementation.
- Keep all names specific to the request.`;
}
