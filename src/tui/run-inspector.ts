import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

type DashboardTab = "goal" | "progress" | "agents" | "decisions" | "artifacts" | "review" | "package";

interface ArtifactDebug {
  id: string;
  type: string;
  ownerAgentId: string;
  status: string;
  reviewStatus?: string;
  approvalStatus?: string;
  finalPackagePath: string;
  inputArtifactIds: string[];
  contentHash?: string;
}

interface RawArtifactDebug extends Omit<ArtifactDebug, "inputArtifactIds"> {
  inputArtifactIds?: string[];
  lineage?: {
    inputArtifactIds?: string[];
  };
}

interface EventDebug {
  timestamp?: string;
  level?: string;
  name?: string;
  agentId?: string;
  artifactId?: string;
  message?: string;
  data?: {
    goal?: string;
    modelMode?: string;
    provider?: string;
    finalPackageDir?: string;
  };
}

interface DecisionDebug {
  id: string;
  title: string;
  selectedOption: string;
  rationale?: string;
}

interface ApprovalDebug {
  id: string;
  artifactId: string;
  status: string;
  approver: string;
}

export interface RunDebugModel {
  runId: string;
  goal?: string;
  modelMode?: string;
  provider?: string;
  runRoot: string;
  finalPackageDir: string;
  artifacts: ArtifactDebug[];
  events: EventDebug[];
  decisions: DecisionDebug[];
  approvals: ApprovalDebug[];
  files: string[];
}

export interface RunInspectorOptions {
  outputRoot: string;
  runId?: string;
}

export async function startDashboard(options: RunInspectorOptions): Promise<void> {
  const model = await loadRunDebugModel(options);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(renderDashboardScreen(model, "goal", 0, 100, 34));
    return;
  }

  await runInteractiveDashboard(model);
}

export async function loadRunDebugModel(options: RunInspectorOptions): Promise<RunDebugModel> {
  const runId = options.runId ?? await findLatestRunId(options.outputRoot);
  if (!runId) {
    throw new Error(`No Agentsim runs found in ${options.outputRoot}. Run agentsim run first.`);
  }

  const runRoot = join(options.outputRoot, runId);
  const finalPackageDir = join(runRoot, "final-package");
  if (!existsSync(finalPackageDir)) {
    throw new Error(`Run ${runId} does not have a final-package directory at ${finalPackageDir}.`);
  }

  const traceDir = join(finalPackageDir, "trace");
  const artifactLineage = await readJsonFile<{ artifacts?: RawArtifactDebug[] }>(join(traceDir, "artifact-lineage.json"), { artifacts: [] });
  const decisions = await readJsonFile<{ decisions?: DecisionDebug[] }>(join(traceDir, "decisions.json"), { decisions: [] });
  const approvals = await readJsonFile<{ approvals?: ApprovalDebug[] }>(join(traceDir, "approvals.json"), { approvals: [] });
  const events = await readEvents(join(traceDir, "events.jsonl"));
  const runStarted = events.find((event) => event.name === "run.started");

  return {
    runId,
    goal: runStarted?.data?.goal,
    modelMode: runStarted?.data?.modelMode,
    provider: runStarted?.data?.provider,
    runRoot,
    finalPackageDir,
    artifacts: (artifactLineage.artifacts ?? []).map(normalizeArtifact),
    events,
    decisions: decisions.decisions ?? [],
    approvals: approvals.approvals ?? [],
    files: await listFiles(finalPackageDir)
  };
}

function normalizeArtifact(artifact: RawArtifactDebug): ArtifactDebug {
  return {
    id: artifact.id,
    type: artifact.type,
    ownerAgentId: artifact.ownerAgentId,
    status: artifact.status,
    reviewStatus: artifact.reviewStatus,
    approvalStatus: artifact.approvalStatus,
    finalPackagePath: artifact.finalPackagePath,
    inputArtifactIds: artifact.inputArtifactIds ?? artifact.lineage?.inputArtifactIds ?? [],
    contentHash: artifact.contentHash
  };
}

export function renderDashboardScreen(
  model: RunDebugModel,
  tab: DashboardTab,
  selectedIndex: number,
  width = 100,
  height = 34
): string {
  const tabs: DashboardTab[] = ["goal", "progress", "agents", "decisions", "artifacts", "review", "package"];
  const header = [
    "Agentsim TUI Dashboard",
    `Run: ${model.runId}`,
    `Goal: ${model.goal ?? "unknown goal"}`,
    "",
    tabs.map((candidate) => candidate === tab ? `[${candidate}]` : ` ${candidate} `).join("  "),
    ""
  ];

  const body = renderTab(model, tab, selectedIndex);
  const footer = [
    "",
    "Keys: left/right switch views, up/down move, q quit",
    "Director flow: give goal -> review progress -> inspect decisions -> approve artifacts -> receive package"
  ];

  return fitToTerminal([...header, ...body, ...footer], width, height).join("\n") + "\n";
}

async function runInteractiveDashboard(model: RunDebugModel): Promise<void> {
  const tabs: DashboardTab[] = ["goal", "progress", "agents", "decisions", "artifacts", "review", "package"];
  let tabIndex = 0;
  let selectedIndex = 0;
  const stdin = process.stdin;

  const render = () => {
    process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
    process.stdout.write(renderDashboardScreen(model, tabs[tabIndex], selectedIndex, process.stdout.columns ?? 100, process.stdout.rows ?? 34));
  };

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\x1b[?25h\x1b[0m\n");
      resolve();
    };

    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", (key: string) => {
      if (key === "q" || key === "\u0003") {
        cleanup();
        return;
      }
      if (key === "\u001b[C") {
        tabIndex = (tabIndex + 1) % tabs.length;
        selectedIndex = 0;
      } else if (key === "\u001b[D") {
        tabIndex = (tabIndex - 1 + tabs.length) % tabs.length;
        selectedIndex = 0;
      } else if (key === "\u001b[B") {
        selectedIndex += 1;
      } else if (key === "\u001b[A") {
        selectedIndex = Math.max(0, selectedIndex - 1);
      }
      render();
    });

    render();
  });
}

function renderTab(model: RunDebugModel, tab: DashboardTab, selectedIndex: number): string[] {
  if (tab === "goal") {
    const failedEvents = model.events.filter((event) => event.level === "error" || event.name?.includes("failed"));
    return [
      "Current assignment",
      `Goal: ${model.goal ?? "unknown goal"}`,
      `Model mode: ${model.modelMode ?? "unknown"} (${model.provider ?? "unknown provider"})`,
      `Final package: ${model.finalPackageDir}`,
      "",
      "Run health",
      `Artifacts ready: ${model.artifacts.filter((artifact) => artifact.status === "approved" || artifact.status === "exported").length}/${model.artifacts.length}`,
      `Decisions recorded: ${model.decisions.length}`,
      `Approvals recorded: ${model.approvals.length}`,
      `Failures: ${failedEvents.length}`,
      "",
      "How to communicate with the AI agency in this early dashboard:",
      "- Give a new goal with agentsim run.",
      "- Inspect agent progress here.",
      "- Use decisions and approvals as the control points.",
      "- Use generated artifacts as the shared context, not chat transcripts."
    ];
  }

  if (tab === "progress") {
    return [
      "Workflow progress",
      ...progressRows(model),
      "",
      "Latest agency updates:",
      ...model.events.slice(-10).map((event) => formatEvent(event))
    ];
  }

  if (tab === "agents") {
    return selectRows(agentRows(model), selectedIndex, (agent, selected) => [
      `${selected} ${agent.name} | ${agent.status}`,
      `    latest: ${agent.latestMessage}`,
      `    artifacts: ${agent.artifacts.join(", ") || "none yet"}`
    ]);
  }

  if (tab === "decisions") {
    const pending = model.approvals.filter((approval) => approval.status === "pending");
    const rows = [
      "Director decisions",
      pending.length === 0 ? "No pending approvals in this run." : `${pending.length} approval(s) need attention.`,
      ""
    ];
    return rows.concat(selectRows(model.decisions, selectedIndex, (decision, selected) => [
      `${selected} ${decision.title} -> ${decision.selectedOption}`,
      `    ${decision.rationale ?? decision.id}`
    ]));
  }

  if (tab === "artifacts") {
    return selectRows(model.artifacts, selectedIndex, (artifact, selected) => [
      `${selected} ${artifact.type} | ${artifact.ownerAgentId} | ${artifact.status} | ${artifact.finalPackagePath}`,
      `    review=${artifact.reviewStatus ?? "n/a"} approval=${artifact.approvalStatus ?? "n/a"} inputs=${artifact.inputArtifactIds.length} hash=${artifact.contentHash ?? "n/a"}`
    ]);
  }

  if (tab === "review") {
    const reviewArtifacts = model.artifacts.filter((artifact) =>
      artifact.ownerAgentId === "reviewer-qa" || artifact.reviewStatus === "passed" || artifact.reviewStatus === "failed"
    );
    return [
      "Review status",
      ...reviewSummaryRows(model),
      ""
    ].concat(selectRows(reviewArtifacts, selectedIndex, (artifact, selected) => [
      `${selected} ${artifact.type} | review=${artifact.reviewStatus ?? "n/a"} | approval=${artifact.approvalStatus ?? "n/a"}`,
      `    ${artifact.finalPackagePath}`
    ]));
  }

  return [
    "Final package",
    `Path: ${model.finalPackageDir}`,
    "",
    "Package files:"
  ].concat(selectRows(model.files, selectedIndex, (file, selected) => [
    `${selected} ${file}`
  ]));
}

function progressRows(model: RunDebugModel): string[] {
  const stages = [
    { label: "Client Intake", agents: ["client-intake"] },
    { label: "Scope / PM", agents: ["scope-pm"] },
    { label: "Architecture", agents: ["software-architect"] },
    { label: "Build", agents: ["builder"] },
    { label: "Review / QA", agents: ["reviewer-qa"] },
    { label: "Delivery", agents: ["delivery"] }
  ];

  return stages.map((stage) => {
    const artifacts = model.artifacts.filter((artifact) => stage.agents.includes(artifact.ownerAgentId));
    const latestEvent = [...model.events].reverse().find((event) => event.agentId && stage.agents.includes(event.agentId));
    const status = artifacts.length > 0 ? "complete" : latestEvent ? "active" : "waiting";
    return `${statusMark(status)} ${stage.label}: ${status} (${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"})`;
  });
}

function agentRows(model: RunDebugModel): Array<{ name: string; status: string; latestMessage: string; artifacts: string[] }> {
  const agents = [
    { id: "client-intake", name: "Client Intake Agent" },
    { id: "scope-pm", name: "Scope / PM Agent" },
    { id: "software-architect", name: "Software Architect Agent" },
    { id: "builder", name: "Builder Agent" },
    { id: "reviewer-qa", name: "Reviewer / QA Agent" },
    { id: "delivery", name: "Delivery Agent" }
  ];

  return agents.map((agent) => {
    const artifacts = model.artifacts.filter((artifact) => artifact.ownerAgentId === agent.id);
    const latestEvent = [...model.events].reverse().find((event) => event.agentId === agent.id);
    return {
      name: agent.name,
      status: artifacts.length > 0 ? "reported" : latestEvent ? "active" : "waiting",
      latestMessage: latestEvent?.message ?? "No update yet.",
      artifacts: artifacts.map((artifact) => artifact.type)
    };
  });
}

function reviewSummaryRows(model: RunDebugModel): string[] {
  const passed = model.artifacts.filter((artifact) => artifact.reviewStatus === "passed").length;
  const failed = model.artifacts.filter((artifact) => artifact.reviewStatus === "failed").length;
  const pending = model.artifacts.filter((artifact) => artifact.reviewStatus === "pending").length;
  return [
    `Passed: ${passed}`,
    `Pending: ${pending}`,
    `Failed: ${failed}`,
    `Known issue artifact: ${model.artifacts.some((artifact) => artifact.type === "known-issues") ? "present" : "missing"}`
  ];
}

function statusMark(status: string): string {
  if (status === "complete") {
    return "[done]";
  }
  if (status === "active") {
    return "[active]";
  }
  return "[wait]";
}

function selectRows<T>(items: T[], selectedIndex: number, render: (item: T, selected: string) => string[]): string[] {
  if (items.length === 0) {
    return ["No records found."];
  }

  const boundedIndex = Math.min(selectedIndex, items.length - 1);
  return items.flatMap((item, index) => render(item, index === boundedIndex ? ">" : " "));
}

function formatEvent(event: EventDebug): string {
  return `${event.timestamp ?? "unknown-time"} | ${event.agentId ?? "system"} | ${event.message ?? event.name ?? "event"}`;
}

function fitToTerminal(lines: string[], width: number, height: number): string[] {
  const usableWidth = Math.max(40, width);
  const usableHeight = Math.max(10, height);
  return lines.slice(0, usableHeight).map((line) => line.length > usableWidth ? `${line.slice(0, usableWidth - 1)}` : line);
}

async function findLatestRunId(outputRoot: string): Promise<string | undefined> {
  if (!existsSync(outputRoot)) {
    return undefined;
  }

  const entries = await readdir(outputRoot, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const runRoot = join(outputRoot, entry.name);
      const finalPackageDir = join(runRoot, "final-package");
      if (!existsSync(finalPackageDir)) {
        return undefined;
      }
      const info = await stat(finalPackageDir);
      return { runId: entry.name, mtimeMs: info.mtimeMs };
    }));

  return candidates
    .filter((candidate): candidate is { runId: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.runId;
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function readEvents(path: string): Promise<EventDebug[]> {
  try {
    const content = await readFile(path, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EventDebug);
  } catch {
    return [];
  }
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
        files.push(relative(root, path));
      }
    }
  }

  await walk(root);
  return files.sort();
}
