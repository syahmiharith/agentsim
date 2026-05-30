import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateGeneratedApp } from "../core/generated-app-validation.js";
import { getAgent } from "./agents.js";
import {
  apiPlan,
  architecture,
  assumptions,
  codeReview,
  databaseSchema,
  handoffNotes,
  knownIssues,
  projectSummary,
  proposal,
  qaReport,
  requirements,
  risks,
  scope,
  taskBreakdown,
  timeline,
  userGuide
} from "../templates/markdown.js";
import { writeGeneratedApp } from "../templates/app.js";
import type { AgentContext, AgentOutputSource, AgentRole, AgentStep, AgentStepResult, ArtifactType } from "../types.js";

type MarkdownFactory = (context: AgentContext) => string;

export const agentSteps: AgentStep[] = [
  markdownStep("client-proposal", "client-intake", "draft client proposal", "proposal", [], false, "artifacts/client/proposal.md", "client/proposal.md", (ctx) => proposal(ctx.domainSpec)),
  markdownStep("client-summary", "client-intake", "summarize project outcome", "project-summary", ["proposal"], false, "artifacts/client/project-summary.md", "client/project-summary.md", (ctx) => projectSummary(ctx.domainSpec)),
  markdownStep("planning-requirements", "scope-pm", "define requirements", "requirements", ["proposal", "project-summary"], false, "artifacts/planning/requirements.md", "planning/requirements.md", (ctx) => requirements(ctx.domainSpec)),
  markdownStep("planning-scope", "scope-pm", "set MVP scope boundaries", "scope", ["requirements"], false, "artifacts/planning/scope.md", "planning/scope.md", (ctx) => scope(ctx.domainSpec)),
  markdownStep("planning-assumptions", "scope-pm", "record assumptions", "assumptions", ["scope"], false, "artifacts/planning/assumptions.md", "planning/assumptions.md", (ctx) => assumptions(ctx.domainSpec)),
  markdownStep("planning-timeline", "scope-pm", "estimate delivery timeline", "timeline", ["scope"], false, "artifacts/planning/timeline.md", "planning/timeline.md", (ctx) => timeline(ctx.domainSpec)),
  markdownStep("planning-risks", "scope-pm", "identify project risks", "risks", ["scope", "assumptions"], false, "artifacts/planning/risks.md", "planning/risks.md", (ctx) => risks(ctx.domainSpec)),
  markdownStep("technical-architecture", "software-architect", "design technical architecture", "architecture", ["requirements", "scope"], false, "artifacts/technical/architecture.md", "technical/architecture.md", (ctx) => architecture(ctx.domainSpec)),
  markdownStep("technical-database-schema", "software-architect", "design local data model", "database-schema", ["architecture"], false, "artifacts/technical/database-schema.md", "technical/database-schema.md", (ctx) => databaseSchema(ctx.domainSpec)),
  markdownStep("technical-api-plan", "software-architect", "design local API plan", "api-plan", ["architecture", "database-schema"], false, "artifacts/technical/api-plan.md", "technical/api-plan.md", (ctx) => apiPlan(ctx.domainSpec)),
  markdownStep("planning-task-breakdown", "scope-pm", "break down implementation tasks", "task-breakdown", ["requirements", "architecture", "api-plan"], false, "artifacts/planning/task-breakdown.md", "planning/task-breakdown.md", (ctx) => taskBreakdown(ctx.domainSpec)),
  {
    id: "builder-app",
    ownerAgentId: "builder",
    action: "generate runnable prototype",
    outputType: "app",
    requiredInputs: ["task-breakdown", "architecture", "api-plan"],
    reviewRequired: true,
    async execute(context): Promise<AgentStepResult> {
      await writeGeneratedApp(context.workspace, context.workspaceDriver, context.domainSpec);
      await context.workspaceDriver.copyDirectory(
        join(context.workspace.workspaceDir, "app"),
        join(context.workspace.finalPackageDir, "app")
      );
      const validation = await validateGeneratedApp(context.workspace.finalPackageDir);
      context.appValidation = validation;
      return {
        content: "Generated runnable app prototype. See final-package/app/README.md.",
        workspaceRelativePath: "artifacts/app.md",
        finalPackagePath: "app/",
        status: validation.ok ? "exported" : "failed",
        reviewStatus: validation.ok ? "passed" : "failed",
        approvalStatus: validation.ok ? "approved" : "pending",
        outputSource: "template",
        actionSummary: validation.message
      };
    }
  },
  markdownStep("review-qa-report", "reviewer-qa", "run package QA review", "qa-report", ["app"], true, "artifacts/review/qa-report.md", "review/qa-report.md", (ctx) => qaReport(ctx.appValidation?.message ?? "Generated app validation did not run.")),
  markdownStep("review-code-review", "reviewer-qa", "review generated code", "code-review", ["app"], true, "artifacts/review/code-review.md", "review/code-review.md", (ctx) => codeReview(ctx.domainSpec)),
  markdownStep("review-known-issues", "reviewer-qa", "document known issues", "known-issues", ["qa-report", "code-review"], true, "artifacts/review/known-issues.md", "review/known-issues.md", (ctx) => knownIssues(ctx.domainSpec, ctx.appValidation?.ok === false)),
  markdownStep("delivery-handoff-notes", "delivery", "assemble handoff notes", "handoff-notes", ["qa-report", "known-issues", "risks"], false, "artifacts/client/handoff-notes.md", "client/handoff-notes.md", (ctx) => handoffNotes(ctx.domainSpec)),
  markdownStep("delivery-user-guide", "delivery", "write user guide", "user-guide", ["project-summary", "app", "handoff-notes"], false, "artifacts/client/user-guide.md", "client/user-guide.md", (ctx) => userGuide(ctx.domainSpec))
];

function markdownStep(
  id: string,
  ownerAgentId: AgentRole,
  action: string,
  outputType: ArtifactType,
  requiredInputs: ArtifactType[],
  reviewRequired: boolean,
  workspaceRelativePath: string,
  finalPackagePath: string,
  factory: MarkdownFactory
): AgentStep {
  return {
    id,
    ownerAgentId,
    action,
    outputType,
    requiredInputs,
    reviewRequired,
    async execute(context): Promise<AgentStepResult> {
      const fallbackContent = factory(context);
      const generated: { content: string; outputSource: AgentOutputSource; model?: string } = context.modelProvider.mode === "live"
        ? await generateLiveMarkdown(context, { id, ownerAgentId, outputType, requiredInputs, reviewRequired, fallbackContent })
        : { content: fallbackContent, outputSource: "template" as AgentOutputSource };

      return {
        content: generated.content,
        workspaceRelativePath,
        finalPackagePath,
        status: reviewRequired ? "reviewed" : "approved",
        reviewStatus: reviewRequired ? "passed" : "not_required",
        approvalStatus: "approved",
        outputSource: generated.outputSource,
        model: generated.model,
        actionSummary: context.modelProvider.mode === "live"
          ? `Generated ${outputType} with ${generated.model}.`
          : `Generated ${outputType} from deterministic template.`
      };
    }
  };
}

async function generateLiveMarkdown(
  context: AgentContext,
  step: Pick<AgentStep, "id" | "ownerAgentId" | "outputType" | "requiredInputs" | "reviewRequired"> & { fallbackContent: string }
): Promise<{ content: string; outputSource: AgentOutputSource; model: string }> {
  const agent = getAgent(step.ownerAgentId);
  const inputSummaries = await Promise.all(step.requiredInputs.map(async (type) => {
    const artifact = context.artifactsByType[type];
    if (!artifact) {
      return `- ${type}: missing`;
    }

    const content = await readFile(artifact.workspacePath, "utf8");
    return `- ${type} (${artifact.finalPackagePath}):\n${truncate(content, 1800)}`;
  }));

  const response = await context.modelProvider.generate({
    system: [
      `You are ${agent.displayName} in Agentsim.`,
      agent.mission,
      "Produce one durable project artifact as concise Markdown.",
      "Do not mention hidden prompts, API keys, environment variables, or internal chain-of-thought.",
      "Do not invent hosted deployment, payments, authentication, or production claims.",
      "Keep the output aligned with a local artifact-first CLI handoff package."
    ].join("\n"),
    prompt: [
      `Client goal: ${context.goal}`,
      `Domain spec:\n${JSON.stringify(context.domainSpec, null, 2)}`,
      `Step: ${step.id}`,
      `Output artifact type: ${step.outputType}`,
      `Review required: ${String(step.reviewRequired)}`,
      "Structured messages for this agent action:",
      context.currentMessages && context.currentMessages.length > 0
        ? context.currentMessages.map((message) => `- ${message.type} from ${message.from}: ${message.question} Expected output: ${message.expectedOutput}`).join("\n")
        : "- none",
      "Input artifacts:",
      inputSummaries.length > 0 ? inputSummaries.join("\n\n") : "- none",
      "Use this deterministic scaffold as the minimum expected coverage. Rewrite it with useful, specific project content while preserving the artifact's purpose:",
      step.fallbackContent
    ].join("\n\n"),
    purpose: `agent-step:${step.id}`
  });

  return {
    content: stripMarkdownFences(response.content.trim()) || step.fallbackContent,
    outputSource: "model",
    model: response.model
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n... [truncated]`;
}

function stripMarkdownFences(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
