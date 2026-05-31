import { agents } from "../agents/agents.js";
import type { ArtifactManifestItem, DomainPack, ReviewRubricCriterion } from "../types.js";
import { inferDomainSpec, inferDomainSpecResult } from "./mock-domain-spec.js";

const artifactManifest: ArtifactManifestItem[] = [
  manifest("proposal", "Proposal", "client-intake", "client/proposal.md", false),
  manifest("project-summary", "Project summary", "client-intake", "client/project-summary.md"),
  manifest("handoff-notes", "Handoff notes", "delivery", "client/handoff-notes.md"),
  manifest("user-guide", "User guide", "delivery", "client/user-guide.md"),
  manifest("requirements", "Requirements", "scope-pm", "planning/requirements.md"),
  manifest("scope", "Scope", "scope-pm", "planning/scope.md"),
  manifest("assumptions", "Assumptions", "scope-pm", "planning/assumptions.md"),
  manifest("timeline", "Timeline", "scope-pm", "planning/timeline.md"),
  manifest("risks", "Risks", "scope-pm", "planning/risks.md"),
  manifest("task-breakdown", "Task breakdown", "scope-pm", "planning/task-breakdown.md"),
  manifest("architecture", "Architecture", "software-architect", "technical/architecture.md"),
  manifest("database-schema", "Database schema", "software-architect", "technical/database-schema.md"),
  manifest("api-plan", "API plan", "software-architect", "technical/api-plan.md"),
  manifest("app", "Runnable app", "builder", "app/", true, true),
  manifest("qa-report", "QA report", "reviewer-qa", "review/qa-report.md", true, true),
  manifest("code-review", "Code review", "reviewer-qa", "review/code-review.md", true, true),
  manifest("known-issues", "Known issues", "reviewer-qa", "review/known-issues.md", true, true)
];

const requiredFinalPackageFiles = [
  ...artifactManifest
    .filter((artifact) => artifact.required && artifact.finalPackagePath !== "app/")
    .map((artifact) => artifact.finalPackagePath),
  "app/package.json",
  "app/index.html",
  "app/server.js",
  "app/src/App.tsx",
  "app/src/main.tsx",
  "app/src/styles.css",
  "app/README.md"
];

const reviewRubric: ReviewRubricCriterion[] = [
  {
    id: "requirements-complete",
    label: "Requirement completeness",
    description: "The package captures the core workflow, fields, users, assumptions, and constraints from the client goal."
  },
  {
    id: "scope-realistic",
    label: "Scope realism",
    description: "The MVP boundaries are clear enough for a solo freelancer to hand off or estimate."
  },
  {
    id: "app-runnable",
    label: "Runnable prototype",
    description: "The generated app includes local run instructions and the expected app files."
  },
  {
    id: "handoff-useful",
    label: "Handoff usefulness",
    description: "Client-facing and developer-facing notes explain what was built, how to review it, and what remains."
  },
  {
    id: "traceable",
    label: "Traceability",
    description: "Events, decisions, approvals, and artifact lineage make the run inspectable."
  }
];

export const softwareFreelancePack: DomainPack = {
  id: "software-freelance",
  displayName: "Software Freelance Delivery",
  version: "0.1.0",
  agents,
  artifactManifest,
  requiredFinalPackageFiles,
  requiredTraceFiles: [
    "trace/events.jsonl",
    "trace/agent-messages.json",
    "trace/agent-actions.json",
    "trace/context-packages.json",
    "trace/context-eval.json",
    "trace/approvals.json",
    "trace/decisions.json",
    "trace/domain-spec.json",
    "trace/workflow-graph.json",
    "trace/tool-registry.json",
    "trace/artifact-lineage.json"
  ],
  reviewRubric,
  inferDomainSpec,
  inferDomainSpecResult
};

function manifest(
  type: ArtifactManifestItem["type"],
  title: string,
  ownerAgentId: ArtifactManifestItem["ownerAgentId"],
  finalPackagePath: string,
  required = true,
  reviewRequired = false
): ArtifactManifestItem {
  return { type, title, ownerAgentId, finalPackagePath, required, reviewRequired };
}
