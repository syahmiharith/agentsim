import type { DomainSpec, FieldSpec } from "../domain/domain-spec.js";
import type { RepoContextSummary } from "../types.js";

export function titleFromGoal(goal: string): string {
  const normalized = goal.replace(/\s+/g, " ").trim();
  const withoutBuild = normalized.replace(/^build\s+/i, "");
  return withoutBuild.charAt(0).toUpperCase() + withoutBuild.slice(1);
}

export function proposal(spec: DomainSpec): string {
  const title = titleFromGoal(spec.sourceGoal);
  return `# Proposal: ${title}

## Objective

Deliver a focused software prototype for: "${spec.sourceGoal}".

## Proposed Solution

Agentsim will produce ${article(spec.appName)} prototype for ${spec.domain}. The app centers on ${spec.primaryEntity.pluralName.toLowerCase()} and supports ${joinHuman(spec.coreActions.map(lowerFirst))}.

## Delivery Package

- Client-facing project summary and user guide.
- Requirements, scope, assumptions, timeline, and risks.
- Technical architecture, data model, API plan, and task breakdown.
- Runnable local app prototype with setup instructions.
- QA report, code review notes, known issues, and handoff guide.

## Success Criteria

- A non-technical client can understand what was built and how to use it.
- A developer can run the app locally from the included README.
- The package includes traceable decisions, artifact lineage, and review outputs.
`;
}

export function projectSummary(spec: DomainSpec, repoContext?: RepoContextSummary): string {
  return `# Project Summary

## Client Goal

${spec.sourceGoal}

## MVP Outcome

The MVP is a local ${spec.domain} prototype named ${spec.appName}. It supports ${joinHuman(spec.coreActions.map(lowerFirst))} for ${spec.primaryEntity.pluralName.toLowerCase()}.

## Primary Users

${bulletList(spec.targetUsers)}

## Screens

${bulletList(spec.screens.map((screen) => `${screen.name}: ${screen.purpose}`))}

## Package Notes

This package is intentionally narrow. It demonstrates the core workflow without production authentication, hosted deployment, or deep third-party integrations.
${repoContextNote(repoContext)}
`;
}

export function requirements(spec: DomainSpec, repoContext?: RepoContextSummary): string {
  return `# Requirements

## Source Goal

${spec.sourceGoal}

## App

${spec.appName} is the local prototype package for the ${spec.domain} workflow.

## Functional Requirements

${bulletList([
    `Create ${spec.primaryEntity.name.toLowerCase()} records with ${joinHuman(spec.primaryEntity.fields.map((field) => field.label.toLowerCase()))}.`,
    `View all submitted ${spec.primaryEntity.pluralName.toLowerCase()} in a scannable list.`,
    `Filter or visually distinguish ${spec.primaryEntity.pluralName.toLowerCase()} by status.`,
    `Update ${spec.primaryEntity.name.toLowerCase()} status through ${joinHuman(spec.workflowStatuses)}.`,
    "Persist data locally for demo use.",
    "Provide setup and run instructions for a developer handoff."
  ])}

## Required Fields

${fieldList(spec.primaryEntity.fields)}

## Non-Functional Requirements

- Run locally without a hosted database.
- Keep the interface simple enough for the target workflow.
- Avoid storing secrets or API keys in generated files.
- Make the delivery package understandable without reading source code first.
${repoContextNote(repoContext)}
`;
}

export function scope(spec: DomainSpec): string {
  return `# Scope

## In Scope

${bulletList([
    `Local prototype for the ${spec.domain} lifecycle.`,
    `${spec.screens[0]?.name ?? `New ${spec.primaryEntity.name}`} form.`,
    `${spec.primaryEntity.name} list and status updates.`,
    `${spec.screens.at(-1)?.name ?? "Admin"} behavior in the same app shell.`,
    "Local JSON-backed API and Vite React frontend."
  ])}

## Out of Scope

- User authentication and permissions.
- Production database migrations.
- External integration automation.
- Email/SMS notifications.
- Hosted deployment automation.

## MVP Constraint

The implementation optimizes for a clear freelance handoff package, not a production SaaS launch.
`;
}

export function assumptions(spec: DomainSpec): string {
  return `# Assumptions

${bulletList([
    "The client needs a workflow prototype before committing to production integrations.",
    "Local persistence is acceptable for MVP demonstration.",
    "Target users can share one local app for the first review.",
    ...spec.assumptions
  ])}
`;
}

export function timeline(spec: DomainSpec): string {
  return `# Timeline

## MVP Delivery Plan

| Phase | Work | Estimated Duration |
| --- | --- | --- |
| Discovery | Confirm fields, workflow statuses, and user roles for ${spec.domain} | 0.5 day |
| Prototype Build | Implement form, list, status update, and local API | 1-2 days |
| Review | Run QA, revise rough edges, document known issues | 0.5 day |
| Handoff | Package README, user guide, and technical notes | 0.5 day |

## Recommended Next Step

Review the prototype with representative users before adding integrations.
`;
}

export function risks(spec: DomainSpec): string {
  return `# Risks

${bulletList([
    `The real ${spec.domain} workflow may require approvals, permissions, or domain-specific fields not captured in the MVP.`,
    "Local JSON persistence is not safe for production multi-user use.",
    "Without authentication, the prototype should not be exposed publicly.",
    "Status options may need adjustment after client review.",
    "Production deployment will require a database, access control, backups, and monitoring.",
    ...spec.risks
  ])}
`;
}

export function architecture(spec: DomainSpec, repoContext?: RepoContextSummary): string {
  return `# Architecture

## Overview

The prototype uses a Vite React frontend and a lightweight Node HTTP API. The API stores ${spec.primaryEntity.pluralName.toLowerCase()} in a local JSON file so the app can run without external infrastructure.

## Components

- React UI for ${spec.primaryEntity.name.toLowerCase()} creation, list review, and status updates.
- Node API with endpoints for listing, creating, and updating ${spec.primaryEntity.pluralName.toLowerCase()}.
- Local JSON data file for persistence.

## Data Flow

1. A target user submits ${article(spec.primaryEntity.name.toLowerCase())} in the browser.
2. The React app sends the record to the local API.
3. The API validates required fields and writes the record to JSON storage.
4. Admin users update workflow status from the queue.
5. The UI refreshes the queue after each mutation.
${repoContextNote(repoContext)}
`;
}

export function databaseSchema(spec: DomainSpec): string {
  return `# Database Schema

## Local JSON Record Shape

\`\`\`ts
interface ${typeName(spec.primaryEntity.name)} {
  id: string;
${spec.primaryEntity.fields.map(fieldTypeLine).join("\n")}
  status: ${unionType(spec.workflowStatuses)};
  createdAt: string;
  updatedAt: string;
}
\`\`\`

## Production Direction

Move this record into a relational table with indexes on \`status\`, \`createdAt\`, and the most common filtering fields once the workflow is validated.
`;
}

export function apiPlan(spec: DomainSpec): string {
  const requiredFields = spec.primaryEntity.fields.filter((field) => field.required).map((field) => `\`${field.name}\``);
  return `# API Plan

## Endpoints

- \`GET /api/${spec.primaryEntity.slug}\` returns all ${spec.primaryEntity.pluralName.toLowerCase()}.
- \`POST /api/${spec.primaryEntity.slug}\` creates ${article(spec.primaryEntity.name.toLowerCase())}.
- \`PATCH /api/${spec.primaryEntity.slug}/:id/status\` updates ${article(spec.primaryEntity.name.toLowerCase())} status.
- \`GET /api/health\` verifies the local API is running.

## Validation

- Required fields: ${joinHuman(requiredFields)}.
- Positive numeric values are required for number fields.
- Unknown statuses are rejected.
`;
}

export function taskBreakdown(spec: DomainSpec): string {
  return `# Task Breakdown

${bulletList([
    `Define ${spec.primaryEntity.name.toLowerCase()} fields and status values.`,
    "Build local API with JSON persistence.",
    `Build React ${spec.primaryEntity.name.toLowerCase()} form and list view.`,
    "Add status update controls.",
    "Add empty, loading, and error states.",
    "Write setup and run instructions.",
    "Run package QA and document known issues."
  ])}
`;
}

export function qaReport(appValidation: string): string {
  return `# QA Report

## Checks Performed

- Verified required final-package directories are generated.
- Verified core planning and technical artifacts are present.
- Verified generated app includes package metadata, source files, local API, and README.
- Verified event trace and artifact lineage are exported.

## Generated App Validation

${appValidation}

## Result

The package is suitable for a first client review demo. Production hardening is intentionally out of scope.
`;
}

export function codeReview(spec: DomainSpec): string {
  return `# Code Review

## Findings

- The generated app uses a deliberately small local API to keep the handoff understandable.
- ${spec.primaryEntity.name} status values are centralized in the UI and API validation path.
- Local JSON persistence is appropriate for demo use but should be replaced before production.
- No API keys or model credentials are written into the generated app.

## Recommendations

- Add authentication before any hosted deployment.
- Add database-backed persistence before multi-user use.
- Add automated tests around API validation if the prototype moves beyond demo status.
`;
}

export function knownIssues(spec: DomainSpec, appValidationFailed: boolean): string {
  const validationNote = appValidationFailed
    ? "- Generated app validation reported issues. See `qa-report.md` for details."
    : "- No blocking package-generation issues were found during MVP validation.";

  return `# Known Issues

${validationNote}
- The prototype has no login or role separation.
- Data is stored in a local JSON file, not a production database.
- The UI is optimized for workflow review, not polished brand presentation.
- ${spec.primaryEntity.name} history and notifications are not implemented yet.
`;
}

export function handoffNotes(spec: DomainSpec): string {
  return `# Handoff Notes

## What Was Delivered

A reviewed local MVP package for: ${spec.sourceGoal}

## Package Orientation

- Client summary: \`client/project-summary.md\`
- User guide: \`client/user-guide.md\`
- Scope and assumptions: \`planning/scope.md\` and \`planning/assumptions.md\`
- Technical plan: \`technical/architecture.md\`, \`technical/api-plan.md\`, and \`technical/database-schema.md\`
- Runnable app: \`app/README.md\`
- Review notes: \`review/qa-report.md\`, \`review/code-review.md\`, and \`review/known-issues.md\`

## Recommended Next Review Questions

- Are these the right ${spec.primaryEntity.name.toLowerCase()} fields?
- Are these the right status values?
- Who should be allowed to update workflow status?
- Which integration matters most after this local prototype?

## Production Notes

Do not deploy this prototype publicly until authentication, production persistence, backups, and environment-specific configuration are added.
`;
}

function repoContextNote(repoContext: RepoContextSummary | undefined): string {
  if (!repoContext) {
    return "";
  }
  const frameworks = repoContext.frameworks.length > 0 ? repoContext.frameworks.join(", ") : "no framework";
  const managers = repoContext.packageManagers.length > 0 ? repoContext.packageManagers.join(", ") : "no package manager";
  return `\n## Imported Repo Context\n\nAgentsim imported read-only context from \`${repoContext.rootPath}\`, detecting ${frameworks} and ${managers}. The generated package still avoids copying private source content or secrets.`;
}

export function userGuide(spec: DomainSpec): string {
  return `# User Guide

## Purpose

${spec.appName} helps ${joinHuman(spec.targetUsers)} manage ${spec.primaryEntity.pluralName.toLowerCase()} through a simple local workflow.

## Main Actions

${bulletList(spec.coreActions)}

## How To Use The Prototype

1. Start the API and web app using the commands in \`app/README.md\`.
2. Open the local Vite URL in a browser.
3. Use the ${spec.screens[0]?.name ?? `New ${spec.primaryEntity.name}`} form to create ${spec.primaryEntity.pluralName.toLowerCase()}.
4. Review submitted records in the ${spec.screens[1]?.name ?? `${spec.primaryEntity.name} List`}.
5. Change status values from the list to simulate the admin workflow.

## Status Values

${bulletList(spec.workflowStatuses)}

## Demo Limitations

- Data is stored locally in the generated app folder.
- There are no user accounts or permissions yet.
- Notifications, integrations, and production deployment are outside this MVP.
`;
}

export function handoffGuide(spec: DomainSpec): string {
  return `# Handoff Guide

## What Was Delivered

A complete MVP package for: ${spec.sourceGoal}

## How To Review

1. Read \`client/project-summary.md\` for the business summary.
2. Review \`planning/scope.md\` and \`planning/assumptions.md\` to confirm boundaries.
3. Run the app using \`app/README.md\`.
4. Use \`review/qa-report.md\` and \`review/known-issues.md\` to guide the next iteration.

## Recommended Client Questions

- Are these the right ${spec.primaryEntity.name.toLowerCase()} fields?
- Are these the right status values?
- Who should be able to change workflow status?
- What systems should this integrate with next?
`;
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function fieldList(fields: FieldSpec[]): string {
  return bulletList(fields.map((field) => `${field.label} (${field.type}${field.required ? ", required" : ", optional"})`));
}

function fieldTypeLine(field: FieldSpec): string {
  const type = field.type === "number" ? "number" : field.options ? unionType(field.options) : "string";
  return `  ${field.name}${field.required ? "" : "?"}: ${type};`;
}

function unionType(values: string[]): string {
  return values.map((value) => JSON.stringify(value)).join(" | ");
}

function typeName(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function article(value: string): string {
  return /^[aeiou]/i.test(value) ? `an ${value}` : `a ${value}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function joinHuman(values: string[]): string {
  if (values.length === 0) {
    return "none";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
