import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Artifact, ContextPackage, Event, RepoContextSummary, Run, Task } from "../types.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { WorkflowGraph } from "./workflow-graph.js";

export interface ViewerResult {
  path: string;
}

export async function generateStaticViewer(runRoot: string): Promise<ViewerResult> {
  const stateRoot = join(runRoot, "state");
  const finalPackageDir = join(runRoot, "final-package");
  const run = await readJson<Run>(join(stateRoot, "run.json"));
  const tasks = await readJson<Task[]>(join(stateRoot, "tasks.json"), []);
  const artifacts = await readJson<Artifact[]>(join(stateRoot, "artifacts.json"), []);
  const contexts = await readJson<ContextPackage[]>(join(stateRoot, "context-packages.json"), []);
  const events = await readEvents(join(stateRoot, "events.jsonl"));
  const graph = await readJson<WorkflowGraph | undefined>(join(stateRoot, "workflow-graph.json"), undefined);
  const repoContext = await readJson<RepoContextSummary | undefined>(join(stateRoot, "repo-context.json"), undefined);
  const toolRegistry = await readJson<ToolRegistry | undefined>(join(stateRoot, "tool-registry.json"), undefined);
  const packageFiles = existsSync(finalPackageDir) ? await listFiles(finalPackageDir) : [];

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agentsim Viewer - ${escapeHtml(run.id)}</title>
  <style>
    body { margin: 0; font-family: Inter, Segoe UI, Arial, sans-serif; color: #1f2937; background: #f7f7f4; }
    header { padding: 24px 32px; background: #20302a; color: white; }
    main { padding: 24px 32px 40px; display: grid; gap: 20px; }
    section { background: white; border: 1px solid #d9ded8; border-radius: 8px; padding: 18px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { color: #4b5563; font-weight: 600; }
    code { font-family: Consolas, monospace; font-size: 12px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .muted { color: #6b7280; }
    .pill { display: inline-block; border: 1px solid #cfd8d3; border-radius: 999px; padding: 2px 8px; margin: 2px; font-size: 12px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f3f4f6; padding: 12px; border-radius: 6px; max-height: 280px; overflow: auto; }
  </style>
</head>
<body>
  <header>
    <h1>Agentsim Run ${escapeHtml(run.id)}</h1>
    <div>${escapeHtml(run.userGoal)}</div>
    <div class="muted">Status: ${escapeHtml(run.status)} | Model: ${escapeHtml(run.modelMode)} | Final package: ${escapeHtml(finalPackageDir)}</div>
  </header>
  <main>
    <div class="grid">
      ${metric("Tasks", String(tasks.length))}
      ${metric("Artifacts", String(artifacts.length))}
      ${metric("Contexts", String(contexts.length))}
      ${metric("Events", String(events.length))}
    </div>
    ${section("Workflow Graph", graph ? renderGraph(graph, tasks) : "<p class=\"muted\">No workflow graph metadata found.</p>")}
    ${section("Artifacts", renderArtifacts(artifacts))}
    ${section("Context Packages", renderContexts(contexts))}
    ${section("Repo Context", repoContext ? renderRepoContext(repoContext) : "<p class=\"muted\">No repo context imported.</p>")}
    ${section("Tool Registry", toolRegistry ? renderToolRegistry(toolRegistry) : "<p class=\"muted\">No tool registry metadata found.</p>")}
    ${section("Final Package Files", renderFileList(packageFiles))}
    ${section("Latest Events", `<pre>${escapeHtml(events.slice(-40).map((event) => `${event.timestamp} ${event.level} ${event.name} ${event.message}`).join("\n"))}</pre>`)}
  </main>
</body>
</html>`;

  const viewerPath = join(runRoot, "viewer", "index.html");
  await mkdir(join(runRoot, "viewer"), { recursive: true });
  await writeFile(viewerPath, html, "utf8");
  return { path: viewerPath };
}

function metric(label: string, value: string): string {
  return `<section><h2>${escapeHtml(label)}</h2><div style="font-size:28px">${escapeHtml(value)}</div></section>`;
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderGraph(graph: WorkflowGraph, tasks: Task[]): string {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return `<table><thead><tr><th>Node</th><th>Kind</th><th>Agent</th><th>Status</th><th>Depends On</th><th>Output</th></tr></thead><tbody>${graph.nodes.map((node) => {
    const deps = graph.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from);
    return `<tr><td><code>${escapeHtml(node.id)}</code></td><td>${escapeHtml(node.kind)}</td><td>${escapeHtml(node.agentId)}</td><td>${escapeHtml(tasksById.get(node.id)?.status ?? "-")}</td><td>${escapeHtml(deps.join(", ") || "-")}</td><td>${escapeHtml(node.outputArtifactType)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function renderArtifacts(artifacts: Artifact[]): string {
  return `<table><thead><tr><th>Type</th><th>Owner</th><th>Status</th><th>Review</th><th>Final Path</th></tr></thead><tbody>${artifacts.map((artifact) =>
    `<tr><td>${escapeHtml(artifact.type)}</td><td>${escapeHtml(artifact.ownerAgentId)}</td><td>${escapeHtml(artifact.status)}</td><td>${escapeHtml(artifact.reviewStatus)}</td><td><code>${escapeHtml(artifact.finalPackagePath)}</code></td></tr>`
  ).join("")}</tbody></table>`;
}

function renderContexts(contexts: ContextPackage[]): string {
  return `<table><thead><tr><th>ID</th><th>Task</th><th>Agent</th><th>Items</th><th>Allowed Tools</th></tr></thead><tbody>${contexts.map((context) =>
    `<tr><td><code>${escapeHtml(context.id)}</code></td><td>${escapeHtml(context.taskId)}</td><td>${escapeHtml(context.agentId)}</td><td>${context.items.length}</td><td>${escapeHtml(context.policy.allowedTools.join(", ") || "-")}</td></tr>`
  ).join("")}</tbody></table>`;
}

function renderRepoContext(repoContext: RepoContextSummary): string {
  return [
    `<p><code>${escapeHtml(repoContext.rootPath)}</code></p>`,
    `<p>${repoContext.frameworks.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || "<span class=\"muted\">No frameworks detected.</span>"}</p>`,
    renderFileList(repoContext.importantFiles.map((file) => `${file.path} (${file.kind}${file.language ? `, ${file.language}` : ""})`))
  ].join("");
}

function renderToolRegistry(toolRegistry: ToolRegistry): string {
  return `<table><thead><tr><th>Name</th><th>Risk</th><th>Approval</th><th>Description</th></tr></thead><tbody>${toolRegistry.tools.map((tool) =>
    `<tr><td><code>${escapeHtml(tool.name)}</code></td><td>${escapeHtml(tool.riskLevel)}</td><td>${String(tool.requiresApproval)}</td><td>${escapeHtml(tool.description)}</td></tr>`
  ).join("")}</tbody></table>`;
}

function renderFileList(files: string[]): string {
  return `<pre>${escapeHtml(files.join("\n") || "none")}</pre>`;
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else {
        files.push(relative(root, path).replace(/\\/g, "/"));
      }
    }
  }
  await walk(root);
  return files.sort();
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

async function readEvents(path: string): Promise<Event[]> {
  try {
    return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Event);
  } catch {
    return [];
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}
