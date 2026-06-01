import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { safeJoin, toSafeRelativePath } from "../core/paths.js";
import type { Artifact, Decision, Event, Run, RunSummary, Task } from "../types.js";
import type { AppSpec } from "../app-spec/app-spec.js";
import type { ProductBrief } from "../domain/product-brief.js";
import type { DomainSpec } from "../domain/domain-spec.js";
import type { RunViewerModel, ViewerArtifact, ViewerCommandResult, ViewerEvent, ViewerFileNode, ViewerMarkdownFile, ViewerTask } from "./viewer-model.js";

const previewLimit = 80;

export async function loadRunViewerModel(runRoot: string): Promise<RunViewerModel> {
  const stateRoot = join(runRoot, "state");
  const finalPackageDir = join(runRoot, "final-package");
  const run = await readJson<Run>(join(stateRoot, "run.json"));
  const tasks = await readJson<Task[]>(join(stateRoot, "tasks.json"), []);
  const artifacts = await readJson<Artifact[]>(join(stateRoot, "artifacts.json"), []);
  const decisionsTrace = await readJson<{ decisions?: Decision[] }>(join(finalPackageDir, "trace", "decisions.json"), {});
  const runSummary = await readJson<RunSummary | undefined>(join(finalPackageDir, "trace", "run-summary.json"), undefined);
  const productBrief = await readJson<ProductBrief | undefined>(join(finalPackageDir, "trace", "product-brief.json"), undefined);
  const domainSpec = await readJson<DomainSpec | undefined>(join(finalPackageDir, "trace", "domain-spec.json"), undefined);
  const appSpec = await readJson<AppSpec | undefined>(join(finalPackageDir, "trace", "app-spec.json"), undefined);
  const appValidation = await readJson<unknown>(join(finalPackageDir, "trace", "app-validation.json"), undefined);
  const workflowGraph = await readJson<unknown>(join(finalPackageDir, "trace", "workflow-graph.json"), undefined);
  const toolRegistry = await readJson<unknown>(join(finalPackageDir, "trace", "tool-registry.json"), undefined);
  const eventsPreview = await readJsonlPreview<ViewerEvent>(join(finalPackageDir, "trace", "events.jsonl"), normalizeEvent);
  const commandResultsPreview = await readJsonlPreview<ViewerCommandResult>(join(finalPackageDir, "trace", "command-results.jsonl"), normalizeCommandResult);

  return {
    run: {
      id: run.id,
      goal: run.userGoal,
      status: run.status,
      modelMode: run.modelMode,
      startedAt: run.createdAt,
      completedAt: run.completedAt,
      outputDir: "<outputs>/" + run.id,
      validationSummary: runSummary?.validationResult ? { ok: runSummary.validationResult.ok, failures: runSummary.validationResult.failures } : undefined,
    },
    goal: {
      appName: appSpec?.appName ?? productBrief?.appName ?? domainSpec?.appName,
      archetype: appSpec?.appArchetype ?? productBrief?.appArchetype ?? domainSpec?.appArchetype,
      primaryEntity: appSpec?.primaryEntity?.name ?? domainSpec?.primaryEntity?.name ?? productBrief?.entities?.[0]?.name,
      targetUsers: appSpec?.targetUsers ?? domainSpec?.targetUsers ?? productBrief?.targetUsers ?? [],
      deferredFeatures: appSpec?.deferredFeatures ?? domainSpec?.deferredFeatures ?? productBrief?.deferredFeatures ?? [],
      unresolvedQuestions: appSpec?.unresolvedQuestions ?? domainSpec?.unresolvedQuestions ?? productBrief?.unresolvedQuestions ?? [],
    },
    progress: progressModel(tasks, artifacts),
    decisions: decisionsTrace.decisions ?? [],
    artifacts: artifacts.map(toViewerArtifact),
    review: {
      qaReport: await readMarkdown(finalPackageDir, "review/qa-report.md", "QA Report"),
      codeReview: await readMarkdown(finalPackageDir, "review/code-review.md", "Code Review"),
      knownIssues: await readMarkdown(finalPackageDir, "review/known-issues.md", "Known Issues"),
      appTestReport: await readMarkdown(finalPackageDir, "app/test-report.md", "Generated App Test Report"),
      appValidation,
    },
    trace: {
      productBrief,
      domainSpec,
      appSpec,
      appValidation,
      workflowGraph,
      toolRegistry,
      eventsPreview,
      commandResultsPreview,
    },
    finalPackage: {
      path: "final-package",
      files: existsSync(finalPackageDir) ? await buildFileTree(finalPackageDir) : [],
    },
  };
}

export async function readFinalPackageFile(runRoot: string, relativePath: string): Promise<{ path: string; content: string; size: number }> {
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid file path.");
  }
  const finalPackageDir = join(runRoot, "final-package");
  const absolutePath = safeJoin(finalPackageDir, relativePath);
  const info = await stat(absolutePath);
  if (!info.isFile()) {
    throw new Error("Path is not a file.");
  }
  return {
    path: toSafeRelativePath(finalPackageDir, absolutePath),
    content: await readFile(absolutePath, "utf8"),
    size: info.size,
  };
}

function progressModel(tasks: Task[], artifacts: Artifact[]): RunViewerModel["progress"] {
  const artifactsByTaskOutput = new Map(artifacts.map((artifact) => [artifact.type, artifact]));
  const viewerTasks: ViewerTask[] = tasks.map((task) => {
    const artifact = task.outputArtifactType ? artifactsByTaskOutput.get(task.outputArtifactType) : undefined;
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      ownerAgentId: task.assignedAgentId,
      outputArtifactType: task.outputArtifactType,
      attempts: task.attempts,
      startedAt: task.createdAt,
      completedAt: task.completedAt,
      reviewStatus: artifact?.reviewStatus,
      approvalStatus: artifact?.approvalStatus,
    };
  });
  return {
    taskCount: tasks.length,
    completed: tasks.filter((task) => task.status === "completed").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    waitingForApproval: tasks.filter((task) => task.status === "waiting_for_approval").length,
    tasks: viewerTasks,
  };
}

function toViewerArtifact(artifact: Artifact): ViewerArtifact {
  return {
    id: artifact.id,
    type: artifact.type,
    category: categorizeArtifact(artifact.finalPackagePath),
    ownerAgentId: artifact.ownerAgentId,
    status: artifact.status,
    reviewStatus: artifact.reviewStatus,
    approvalStatus: artifact.approvalStatus,
    finalPackagePath: artifact.finalPackagePath,
    previewPath: artifact.finalPackagePath.endsWith(".md") ? artifact.finalPackagePath : undefined,
  };
}

function categorizeArtifact(path: string): ViewerArtifact["category"] {
  if (path.startsWith("client/")) return "Client";
  if (path.startsWith("planning/")) return "Planning";
  if (path.startsWith("technical/")) return "Technical";
  if (path.startsWith("app/")) return "App";
  if (path.startsWith("review/")) return "Review";
  if (path.startsWith("trace/")) return "Trace";
  if (path.startsWith("delivery/")) return "Delivery";
  return "Other";
}

async function readMarkdown(root: string, relativePath: string, title: string): Promise<ViewerMarkdownFile | undefined> {
  try {
    return {
      path: relativePath,
      title,
      content: await readFile(safeJoin(root, relativePath), "utf8"),
    };
  } catch {
    return undefined;
  }
}

async function buildFileTree(root: string, relativePath = ""): Promise<ViewerFileNode[]> {
  const dir = relativePath ? safeJoin(root, relativePath) : root;
  const entries = await readdir(dir, { withFileTypes: true });
  const nodes = await Promise.all(
    entries.map(async (entry): Promise<ViewerFileNode> => {
      const path = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const absolutePath = safeJoin(root, path);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path,
          type: "directory",
          children: await buildFileTree(root, path),
        };
      }
      const info = await stat(absolutePath);
      return {
        name: entry.name,
        path,
        type: "file",
        size: info.size,
      };
    }),
  );
  return nodes.sort((left, right) => {
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (arguments.length >= 2) {
      return fallback as T;
    }
    throw error;
  }
}

async function readJsonlPreview<T>(path: string, normalize: (value: Record<string, unknown>) => T): Promise<T[]> {
  try {
    const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).slice(-previewLimit);
    return lines.map((line) => normalize(JSON.parse(line) as Record<string, unknown>));
  } catch {
    return [];
  }
}

function normalizeEvent(value: Record<string, unknown>): ViewerEvent {
  const event = value as Partial<Event>;
  return {
    timestamp: typeof event.timestamp === "string" ? event.timestamp : undefined,
    level: typeof event.level === "string" ? event.level : undefined,
    name: typeof event.name === "string" ? event.name : undefined,
    message: typeof event.message === "string" ? event.message : undefined,
    actor: typeof event.agentId === "string" ? event.agentId : typeof event.taskId === "string" ? event.taskId : "system",
  };
}

function normalizeCommandResult(value: Record<string, unknown>): ViewerCommandResult {
  return {
    timestamp: stringValue(value.timestamp),
    command: stringValue(value.command),
    args: Array.isArray(value.args) ? value.args.filter((item): item is string => typeof item === "string") : undefined,
    cwd: redactPath(stringValue(value.cwd)),
    exitCode: typeof value.exitCode === "number" ? value.exitCode : undefined,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
    timedOut: typeof value.timedOut === "boolean" ? value.timedOut : undefined,
    policyLevel: stringValue(value.policyLevel),
    deniedReason: stringValue(value.deniedReason),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function redactPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\\/g, "/");
  const finalPackageIndex = normalized.lastIndexOf("/final-package/");
  if (finalPackageIndex >= 0) {
    return "final-package/" + normalized.slice(finalPackageIndex + "/final-package/".length);
  }
  const workspaceIndex = normalized.lastIndexOf("/workspace/");
  if (workspaceIndex >= 0) {
    return "workspace/" + normalized.slice(workspaceIndex + "/workspace/".length);
  }
  return relative(process.cwd(), value).replace(/\\/g, "/");
}
