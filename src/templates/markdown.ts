export function titleFromGoal(goal: string): string {
  const normalized = goal.replace(/\s+/g, " ").trim();
  const withoutBuild = normalized.replace(/^build\s+/i, "");
  return withoutBuild.charAt(0).toUpperCase() + withoutBuild.slice(1);
}

export function proposal(goal: string): string {
  const title = titleFromGoal(goal);
  return `# Proposal: ${title}

## Objective

Deliver a focused software prototype for: "${goal}".

## Proposed Solution

Agentsim will produce a small inventory request system that lets staff create inventory requests, review the request queue, and update fulfillment status from an admin-oriented view.

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

export function projectSummary(goal: string): string {
  return `# Project Summary

## Client Goal

${goal}

## MVP Outcome

The MVP is a local inventory request prototype for a small flower business. It supports request creation, list review, status updates, and a basic admin workflow.

## Primary Users

- Shop staff requesting inventory replenishment.
- Admin or operations staff reviewing and updating requests.

## Package Notes

This package is intentionally narrow. It demonstrates the core workflow without production authentication, hosted deployment, or deep ERP integration.
`;
}

export function requirements(goal: string): string {
  return `# Requirements

## Source Goal

${goal}

## Functional Requirements

- Create an inventory request with item name, quantity, requester, priority, and notes.
- View all submitted requests in a scannable list.
- Filter or visually distinguish requests by status.
- Update request status through Pending, Approved, Ordered, Fulfilled, and Rejected.
- Persist request data locally for demo use.
- Provide setup and run instructions for a developer handoff.

## Non-Functional Requirements

- Run locally without a hosted database.
- Keep the interface simple enough for a small business workflow.
- Avoid storing secrets or API keys in generated files.
- Make the delivery package understandable without reading source code first.
`;
}

export function scope(goal: string): string {
  return `# Scope

## In Scope

- Local prototype for the inventory request lifecycle.
- Staff request form.
- Request queue and status updates.
- Basic admin page behavior in the same app shell.
- Local JSON-backed API and Vite React frontend.

## Out of Scope

- User authentication and permissions.
- Production database migrations.
- Supplier ordering integrations.
- Email/SMS notifications.
- Hosted deployment automation.

## MVP Constraint

The implementation optimizes for a clear freelance handoff package, not a production SaaS launch.
`;
}

export function assumptions(): string {
  return `# Assumptions

- The client needs a workflow prototype before committing to production integrations.
- Local persistence is acceptable for MVP demonstration.
- Staff and admin users can share one local app for the first review.
- Inventory requests are simple records, not full purchase orders.
- Status history can be added later if the client validates the workflow.
`;
}

export function timeline(): string {
  return `# Timeline

## MVP Delivery Plan

| Phase | Work | Estimated Duration |
| --- | --- | --- |
| Discovery | Confirm inventory request fields and statuses | 0.5 day |
| Prototype Build | Implement form, list, status update, and local API | 1-2 days |
| Review | Run QA, revise rough edges, document known issues | 0.5 day |
| Handoff | Package README, user guide, and technical notes | 0.5 day |

## Recommended Next Step

Review the prototype with one staff member and one admin before adding integrations.
`;
}

export function risks(): string {
  return `# Risks

- The real workflow may require approvals, budgets, or supplier-specific fields not captured in the MVP.
- Local JSON persistence is not safe for production multi-user use.
- Without authentication, the prototype should not be exposed publicly.
- Status options may need adjustment after client review.
- Production deployment will require a database, access control, backups, and monitoring.
`;
}

export function architecture(): string {
  return `# Architecture

## Overview

The prototype uses a Vite React frontend and a lightweight Node HTTP API. The API stores requests in a local JSON file so the app can run without external infrastructure.

## Components

- React UI for request creation, queue review, and status updates.
- Node API with endpoints for listing, creating, and updating requests.
- Local JSON data file for persistence.

## Data Flow

1. Staff submits an inventory request in the browser.
2. The React app sends the request to the local API.
3. The API validates required fields and writes the request to JSON storage.
4. Admin users update request status from the queue.
5. The UI refreshes the queue after each mutation.
`;
}

export function databaseSchema(): string {
  return `# Database Schema

## Local JSON Record Shape

\`\`\`ts
interface InventoryRequest {
  id: string;
  itemName: string;
  quantity: number;
  requester: string;
  priority: "Low" | "Normal" | "High";
  status: "Pending" | "Approved" | "Ordered" | "Fulfilled" | "Rejected";
  notes: string;
  createdAt: string;
  updatedAt: string;
}
\`\`\`

## Production Direction

Move this record into a relational table with indexes on \`status\`, \`priority\`, and \`createdAt\` once the workflow is validated.
`;
}

export function apiPlan(): string {
  return `# API Plan

## Endpoints

- \`GET /api/requests\` returns all inventory requests.
- \`POST /api/requests\` creates a request.
- \`PATCH /api/requests/:id/status\` updates a request status.
- \`GET /api/health\` verifies the local API is running.

## Validation

- \`itemName\`, \`requester\`, and positive \`quantity\` are required.
- Unknown statuses are rejected.
- Notes are optional.
`;
}

export function taskBreakdown(): string {
  return `# Task Breakdown

- Define request record fields and status values.
- Build local API with JSON persistence.
- Build React request form and queue.
- Add status update controls.
- Add empty, loading, and error states.
- Write setup and run instructions.
- Run package QA and document known issues.
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

export function codeReview(): string {
  return `# Code Review

## Findings

- The generated app uses a deliberately small local API to keep the handoff understandable.
- Request status values are centralized in the UI and API validation path.
- Local JSON persistence is appropriate for demo use but should be replaced before production.
- No API keys or model credentials are written into the generated app.

## Recommendations

- Add authentication before any hosted deployment.
- Add database-backed persistence before multi-user use.
- Add automated tests around API validation if the prototype moves beyond demo status.
`;
}

export function knownIssues(appValidationFailed: boolean): string {
  const validationNote = appValidationFailed
    ? "- Generated app validation reported issues. See `qa-report.md` for details."
    : "- No blocking package-generation issues were found during MVP validation.";

  return `# Known Issues

${validationNote}
- The prototype has no login or role separation.
- Data is stored in a local JSON file, not a production database.
- The UI is optimized for workflow review, not polished brand presentation.
- There is no supplier integration or notification workflow yet.
`;
}

export function handoffGuide(goal: string): string {
  return `# Handoff Guide

## What Was Delivered

A complete MVP package for: ${goal}

## How To Review

1. Read \`client/project-summary.md\` for the business summary.
2. Review \`planning/scope.md\` and \`planning/assumptions.md\` to confirm boundaries.
3. Run the app using \`app/README.md\`.
4. Use \`review/qa-report.md\` and \`review/known-issues.md\` to guide the next iteration.

## Recommended Client Questions

- Are these the right request fields?
- Are these the right status values?
- Who should be able to approve or reject requests?
- What supplier or inventory system should this integrate with next?
`;
}

