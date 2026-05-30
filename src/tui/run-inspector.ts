import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

type InspectorTab = "summary" | "artifacts" | "events" | "decisions" | "approvals";

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

export async function startRunInspector(options: RunInspectorOptions): Promise<void> {
  const model = await loadRunDebugModel(options);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(renderRunDebugScreen(model, "summary", 0, 100, 30));
    return;
  }

  await runInteractiveInspector(model);
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

  return {
    runId,
    runRoot,
    finalPackageDir,
    artifacts: (artifactLineage.artifacts ?? []).map(normalizeArtifact),
    events: await readEvents(join(traceDir, "events.jsonl")),
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

export function renderRunDebugScreen(
  model: RunDebugModel,
  tab: InspectorTab,
  selectedIndex: number,
  width = 100,
  height = 30
): string {
  const tabs: InspectorTab[] = ["summary", "artifacts", "events", "decisions", "approvals"];
  const header = [
    "Agentsim Debug TUI",
    `Run: ${model.runId}`,
    `Package: ${model.finalPackageDir}`,
    "",
    tabs.map((candidate) => candidate === tab ? `[${candidate}]` : ` ${candidate} `).join("  "),
    ""
  ];

  const body = renderTab(model, tab, selectedIndex);
  const footer = [
    "",
    "Keys: left/right switch tabs, up/down move, q quit"
  ];

  return fitToTerminal([...header, ...body, ...footer], width, height).join("\n") + "\n";
}

async function runInteractiveInspector(model: RunDebugModel): Promise<void> {
  const tabs: InspectorTab[] = ["summary", "artifacts", "events", "decisions", "approvals"];
  let tabIndex = 0;
  let selectedIndex = 0;
  const stdin = process.stdin;

  const render = () => {
    process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
    process.stdout.write(renderRunDebugScreen(model, tabs[tabIndex], selectedIndex, process.stdout.columns ?? 100, process.stdout.rows ?? 30));
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

function renderTab(model: RunDebugModel, tab: InspectorTab, selectedIndex: number): string[] {
  if (tab === "summary") {
    const failedEvents = model.events.filter((event) => event.level === "error" || event.name?.includes("failed"));
    return [
      `Artifacts: ${model.artifacts.length}`,
      `Events: ${model.events.length}`,
      `Decisions: ${model.decisions.length}`,
      `Approvals: ${model.approvals.length}`,
      `Files: ${model.files.length}`,
      `Failures: ${failedEvents.length}`,
      "",
      "Recent events:",
      ...model.events.slice(-8).map((event) => formatEvent(event))
    ];
  }

  if (tab === "artifacts") {
    return selectRows(model.artifacts, selectedIndex, (artifact, selected) => [
      `${selected} ${artifact.type} | ${artifact.ownerAgentId} | ${artifact.status} | ${artifact.finalPackagePath}`,
      `    review=${artifact.reviewStatus ?? "n/a"} approval=${artifact.approvalStatus ?? "n/a"} inputs=${artifact.inputArtifactIds.length} hash=${artifact.contentHash ?? "n/a"}`
    ]);
  }

  if (tab === "events") {
    return selectRows(model.events, selectedIndex, (event, selected) => [
      `${selected} ${formatEvent(event)}`,
      `    artifact=${event.artifactId ?? "n/a"}`
    ]);
  }

  if (tab === "decisions") {
    return selectRows(model.decisions, selectedIndex, (decision, selected) => [
      `${selected} ${decision.title} -> ${decision.selectedOption}`,
      `    ${decision.rationale ?? decision.id}`
    ]);
  }

  return selectRows(model.approvals, selectedIndex, (approval, selected) => [
    `${selected} ${approval.status} by ${approval.approver}`,
    `    artifact=${approval.artifactId} approval=${approval.id}`
  ]);
}

function selectRows<T>(items: T[], selectedIndex: number, render: (item: T, selected: string) => string[]): string[] {
  if (items.length === 0) {
    return ["No records found."];
  }

  const boundedIndex = Math.min(selectedIndex, items.length - 1);
  return items.flatMap((item, index) => render(item, index === boundedIndex ? ">" : " "));
}

function formatEvent(event: EventDebug): string {
  return `${event.timestamp ?? "unknown-time"} | ${event.level ?? "info"} | ${event.name ?? "event"} | ${event.agentId ?? "system"} | ${event.message ?? ""}`;
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
