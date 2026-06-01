#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { z } from "zod";
import { loadDotEnv } from "./config.js";
import { LocalApprovalsRepo, LocalRunsRepo, LocalTasksRepo } from "./core/repositories.js";
import { builtInToolRegistry } from "./core/tool-registry.js";
import {
  loadRunInspection,
  renderApprovals,
  renderArtifacts,
  renderContext,
  renderContexts,
  renderEvents,
  renderGraph,
  renderInspect,
  renderTasks,
} from "./inspection.js";
import { createModelProvider, type ProviderSelection } from "./providers/index.js";
import { startDashboard } from "./tui/run-inspector.js";
import { resolveRunRoot, resumeOrchestrator } from "./orchestrator.js";
import { runDemo } from "./workflow.js";
import { startViewerServer } from "./viewer/viewer-server.js";
import type { CommandPolicyLevel } from "./types.js";

type CliCommand =
  | "run"
  | "demo"
  | "dashboard"
  | "tui"
  | "inspect"
  | "events"
  | "artifacts"
  | "tasks"
  | "graph"
  | "approvals"
  | "contexts"
  | "context"
  | "viewer"
  | "tools"
  | "approve"
  | "reject"
  | "resume";

interface CliOptions {
  command?: CliCommand | string;
  goal?: string;
  providerSelection: ProviderSelection;
  outputRoot: string;
  runId?: string;
  contextPackageId?: string;
  approvalId?: string;
  repoPath?: string;
  allowCommands?: boolean;
  commandPolicyLevel?: CommandPolicyLevel;
  maxConcurrentTasks?: number;
  port?: number;
}

const cliOptionsSchema = z.object({
  command: z
    .enum([
      "run",
      "demo",
      "dashboard",
      "tui",
      "inspect",
      "events",
      "artifacts",
      "tasks",
      "graph",
      "approvals",
      "contexts",
      "context",
      "viewer",
      "tools",
      "approve",
      "reject",
      "resume",
    ])
    .optional(),
  goal: z.string().trim().min(1).optional(),
  providerSelection: z.enum(["auto", "mock", "live"]),
  outputRoot: z.string().trim().min(1),
  runId: z.string().trim().min(1).optional(),
  contextPackageId: z.string().trim().min(1).optional(),
  approvalId: z.string().trim().min(1).optional(),
  repoPath: z.string().trim().min(1).optional(),
  allowCommands: z.boolean().optional(),
  commandPolicyLevel: z.enum(["strict", "dev", "unsafe-local"]).optional(),
  maxConcurrentTasks: z.number().int().positive().optional(),
  port: z.number().int().positive().optional(),
});

export async function main(argv: string[]): Promise<void> {
  loadDotEnv();
  let options: CliOptions;

  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!isSupportedCommand(options.command)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (options.command === "dashboard" || options.command === "tui") {
    await startDashboard({
      outputRoot: resolve(options.outputRoot),
      runId: options.runId ?? options.goal,
    });
    return;
  }

  if (options.command === "tools") {
    console.log(renderTools());
    return;
  }

  if (options.command === "viewer") {
    const runId = options.runId ?? options.goal;
    if (!runId) {
      console.error("Missing run id. Example: agentsim viewer <runId>");
      process.exitCode = 1;
      return;
    }
    const server = await startViewerServer({ runRoot: resolveRunRoot(resolve(options.outputRoot), runId), port: options.port });
    console.log(`Viewer: ${server.url}`);
    console.log("Press Ctrl+C to stop.");
    await server.closed;
    return;
  }

  if (isInspectionCommand(options.command)) {
    const model = await loadRunInspection(resolve(options.outputRoot), options.runId ?? options.goal);
    const output =
      options.command === "inspect"
        ? renderInspect(model)
        : options.command === "events"
          ? renderEvents(model)
          : options.command === "artifacts"
            ? renderArtifacts(model)
            : options.command === "tasks"
              ? renderTasks(model)
              : options.command === "graph"
                ? renderGraph(model)
                : options.command === "approvals"
                  ? renderApprovals(model)
                  : options.command === "contexts"
                    ? renderContexts(model)
                    : renderContext(model, options.contextPackageId);
    console.log(output);
    return;
  }

  if (options.command === "approve" || options.command === "reject") {
    if (!options.runId || !options.approvalId) {
      console.error(`Missing run id or approval id. Example: agentsim ${options.command} <runId> <approvalId>`);
      process.exitCode = 1;
      return;
    }
    await resolveApproval({
      outputRoot: resolve(options.outputRoot),
      runId: options.runId,
      approvalId: options.approvalId,
      status: options.command === "approve" ? "approved" : "rejected",
    });
    console.log(`Approval ${options.approvalId} ${options.command === "approve" ? "approved" : "rejected"}.`);
    return;
  }

  if (options.command === "resume") {
    if (!options.runId && !options.goal) {
      console.error("Missing run id. Example: agentsim resume <runId>");
      process.exitCode = 1;
      return;
    }
    const runId = options.runId ?? options.goal ?? "";
    const providerSelection = await selectResumeProviderSelection(resolve(options.outputRoot), runId, options.providerSelection);
    const provider = createModelProvider(providerSelection);
    const result = await resumeOrchestrator({
      outputRoot: resolve(options.outputRoot),
      runId,
      modelProvider: provider,
      allowCommands: options.allowCommands,
      commandPolicyLevel: options.commandPolicyLevel,
      maxConcurrentTasks: options.maxConcurrentTasks,
    });
    console.log(`Agentsim run resumed.`);
    console.log(`Run ID: ${result.taskRun.id}`);
    console.log(`Status: ${result.taskRun.status}`);
    console.log(`Final package: ${result.finalPackageDir}`);
    return;
  }

  if (!options.goal) {
    console.error('Missing goal. Example: agentsim run "Build an inventory request system for a flower company"');
    process.exitCode = 1;
    return;
  }

  const provider = createModelProvider(options.providerSelection);
  const result = await runDemo({
    goal: options.goal,
    outputRoot: resolve(options.outputRoot),
    runId: options.runId,
    modelProvider: provider,
    repoPath: options.repoPath,
    allowCommands: options.allowCommands,
    commandPolicyLevel: options.commandPolicyLevel,
    maxConcurrentTasks: options.maxConcurrentTasks,
  });

  console.log(`Agentsim run completed.`);
  console.log(`Run ID: ${result.taskRun.id}`);
  console.log(`Model mode: ${result.taskRun.modelMode}`);
  console.log(`Final package: ${result.finalPackageDir}`);
}

export function parseArgs(argv: string[]): CliOptions {
  let parsed: CliOptions = {
    providerSelection: "auto",
    outputRoot: "outputs",
  };

  const program = new Command();
  program
    .name("agentsim")
    .exitOverride()
    .allowExcessArguments(false)
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    });

  addRunCommand(program, "run", (options) => {
    parsed = options;
  });
  addRunCommand(program, "demo", (options) => {
    parsed = options;
  });
  addDashboardCommand(program, "dashboard", (options) => {
    parsed = options;
  });
  addDashboardCommand(program, "tui", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "inspect", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "events", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "artifacts", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "tasks", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "graph", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "approvals", (options) => {
    parsed = options;
  });
  addInspectionCommand(program, "contexts", (options) => {
    parsed = options;
  });
  addContextCommand(program, (options) => {
    parsed = options;
  });
  addViewerCommand(program, (options) => {
    parsed = options;
  });
  addToolsCommand(program, (options) => {
    parsed = options;
  });
  addApprovalCommand(program, "approve", (options) => {
    parsed = options;
  });
  addApprovalCommand(program, "reject", (options) => {
    parsed = options;
  });
  addResumeCommand(program, (options) => {
    parsed = options;
  });

  program.parse(["node", "agentsim", ...argv], { from: "node" });
  return cliOptionsSchema.parse(parsed);
}

function isSupportedCommand(command: string | undefined): command is CliCommand {
  return (
    command === "run" ||
    command === "demo" ||
    command === "dashboard" ||
    command === "tui" ||
    command === "inspect" ||
    command === "events" ||
    command === "artifacts" ||
    command === "tasks" ||
    command === "graph" ||
    command === "approvals" ||
    command === "contexts" ||
    command === "context" ||
    command === "viewer" ||
    command === "tools" ||
    command === "approve" ||
    command === "reject" ||
    command === "resume"
  );
}

function isInspectionCommand(
  command: string | undefined,
): command is "inspect" | "events" | "artifacts" | "tasks" | "graph" | "approvals" | "contexts" | "context" {
  return (
    command === "inspect" ||
    command === "events" ||
    command === "artifacts" ||
    command === "tasks" ||
    command === "graph" ||
    command === "approvals" ||
    command === "contexts" ||
    command === "context"
  );
}

function addRunCommand(program: Command, name: "run" | "demo", onParse: (options: CliOptions) => void): void {
  program
    .command(name)
    .argument("[goal...]", "client software goal")
    .option("--mock", "use deterministic mock model mode")
    .option("--live", "require configured live model mode")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .option("--run-id <id>", "stable run id")
    .option("--repo <path>", "import read-only repo context from a local project")
    .option("--allow-commands", "allow approved run_command tool calls")
    .option("--command-policy <level>", "command policy: strict, dev, unsafe-local", "strict")
    .option("--max-concurrent-tasks <count>", "maximum ready tasks to execute at once", parsePositiveInt)
    .action(
      (
        goalParts: string[],
        flags: {
          mock?: boolean;
          live?: boolean;
          outDir: string;
          runId?: string;
          repo?: string;
          allowCommands?: boolean;
          commandPolicy: CommandPolicyLevel;
          maxConcurrentTasks?: number;
        },
      ) => {
        if (flags.mock && flags.live) {
          throw new Error("Choose only one provider mode: --mock or --live.");
        }
        if (flags.commandPolicy === "unsafe-local" && !flags.allowCommands) {
          throw new Error("--command-policy unsafe-local requires --allow-commands.");
        }
        onParse({
          command: name,
          goal: goalParts.join(" ").trim() || undefined,
          providerSelection: flags.live ? "live" : flags.mock ? "mock" : "auto",
          outputRoot: flags.outDir,
          runId: flags.runId,
          repoPath: flags.repo,
          allowCommands: flags.allowCommands,
          commandPolicyLevel: flags.commandPolicy,
          maxConcurrentTasks: flags.maxConcurrentTasks,
        });
      },
    );
}

function addDashboardCommand(program: Command, name: "dashboard" | "tui", onParse: (options: CliOptions) => void): void {
  program
    .command(name)
    .argument("[runId]", "run id to inspect")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .action((runId: string | undefined, flags: { outDir: string }) => {
      onParse({
        command: name,
        goal: runId,
        providerSelection: "auto",
        outputRoot: flags.outDir,
      });
    });
}

function addInspectionCommand(
  program: Command,
  name: "inspect" | "events" | "artifacts" | "tasks" | "graph" | "approvals" | "contexts",
  onParse: (options: CliOptions) => void,
): void {
  program
    .command(name)
    .argument("[runId]", "run id to inspect")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .action((runId: string | undefined, flags: { outDir: string }) => {
      onParse({
        command: name,
        goal: runId,
        runId,
        providerSelection: "auto",
        outputRoot: flags.outDir,
      });
    });
}

function addViewerCommand(program: Command, onParse: (options: CliOptions) => void): void {
  program
    .command("viewer")
    .argument("[runId]", "run id to render")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .option("--output-root <dir>", "output root directory")
    .option("--port <port>", "local viewer port", parsePort)
    .action((runId: string | undefined, flags: { outDir: string; outputRoot?: string; port?: number }) => {
      onParse({
        command: "viewer",
        goal: runId,
        runId,
        providerSelection: "auto",
        outputRoot: flags.outputRoot ?? flags.outDir,
        port: flags.port,
      });
    });
}

function addToolsCommand(program: Command, onParse: (options: CliOptions) => void): void {
  program.command("tools").action(() => {
    onParse({
      command: "tools",
      providerSelection: "auto",
      outputRoot: "outputs",
    });
  });
}

function addContextCommand(program: Command, onParse: (options: CliOptions) => void): void {
  program
    .command("context")
    .argument("<runId>", "run id to inspect")
    .argument("<contextPackageId>", "context package id to inspect")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .action((runId: string, contextPackageId: string, flags: { outDir: string }) => {
      onParse({
        command: "context",
        goal: runId,
        runId,
        contextPackageId,
        providerSelection: "auto",
        outputRoot: flags.outDir,
      });
    });
}

function addApprovalCommand(program: Command, name: "approve" | "reject", onParse: (options: CliOptions) => void): void {
  program
    .command(name)
    .argument("<runId>", "run id")
    .argument("<approvalId>", "approval id")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .action((runId: string, approvalId: string, flags: { outDir: string }) => {
      onParse({
        command: name,
        runId,
        approvalId,
        providerSelection: "auto",
        outputRoot: flags.outDir,
      });
    });
}

function addResumeCommand(program: Command, onParse: (options: CliOptions) => void): void {
  program
    .command("resume")
    .argument("<runId>", "run id")
    .option("--mock", "resume with deterministic mock model mode")
    .option("--live", "resume with configured live model mode")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .option("--allow-commands", "allow approved run_command tool calls")
    .option("--command-policy <level>", "command policy: strict, dev, unsafe-local", "strict")
    .option("--max-concurrent-tasks <count>", "maximum ready tasks to execute at once", parsePositiveInt)
    .action(
      (
        runId: string,
        flags: { mock?: boolean; live?: boolean; outDir: string; allowCommands?: boolean; commandPolicy: CommandPolicyLevel; maxConcurrentTasks?: number },
      ) => {
        if (flags.mock && flags.live) {
          throw new Error("Choose only one provider mode: --mock or --live.");
        }
        if (flags.commandPolicy === "unsafe-local" && !flags.allowCommands) {
          throw new Error("--command-policy unsafe-local requires --allow-commands.");
        }
        onParse({
          command: "resume",
          goal: runId,
          runId,
          providerSelection: flags.live ? "live" : flags.mock ? "mock" : "auto",
          outputRoot: flags.outDir,
          allowCommands: flags.allowCommands,
          commandPolicyLevel: flags.commandPolicy,
          maxConcurrentTasks: flags.maxConcurrentTasks,
        });
      },
    );
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("--max-concurrent-tasks must be a positive integer.");
  }
  return parsed;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("--port must be an integer between 1 and 65535.");
  }
  return parsed;
}

function renderTools(): string {
  return builtInToolRegistry.tools
    .map((tool) => `${tool.name} | ${tool.riskLevel} | approval=${String(tool.requiresApproval)} | ${tool.description}`)
    .join("\n");
}

async function selectResumeProviderSelection(outputRoot: string, runId: string, selection: ProviderSelection): Promise<ProviderSelection> {
  if (selection !== "auto") {
    return selection;
  }
  const run = await new LocalRunsRepo(resolveRunRoot(outputRoot, runId)).getRun();
  return run.modelMode;
}

async function resolveApproval(input: { outputRoot: string; runId: string; approvalId: string; status: "approved" | "rejected" }): Promise<void> {
  const runRoot = resolveRunRoot(input.outputRoot, input.runId);
  const approvalsRepo = new LocalApprovalsRepo(runRoot);
  const tasksRepo = new LocalTasksRepo(runRoot);
  const runsRepo = new LocalRunsRepo(runRoot);
  const approval = await approvalsRepo.updateApprovalStatus(input.approvalId, input.status);
  if (approval.taskId) {
    await tasksRepo.updateTaskStatus(
      approval.taskId,
      input.status === "approved" ? "ready" : "failed",
      input.status === "rejected" ? "Approval rejected." : undefined,
    );
    await runsRepo.updateRunStatus(input.status === "approved" ? "running" : "failed", input.status === "rejected" ? "Approval rejected." : undefined);
  }
}

function printUsage(): void {
  console.error(`Usage:
  agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  agentsim dashboard [runId] [--out-dir outputs]
  agentsim tui [runId] [--out-dir outputs]
  agentsim inspect [runId] [--out-dir outputs]
  agentsim events [runId] [--out-dir outputs]
  agentsim artifacts [runId] [--out-dir outputs]
  agentsim tasks [runId] [--out-dir outputs]
  agentsim graph [runId] [--out-dir outputs]
  agentsim approvals [runId] [--out-dir outputs]
  agentsim contexts [runId] [--out-dir outputs]
  agentsim context <runId> <contextPackageId> [--out-dir outputs]
  agentsim viewer [runId] [--out-dir outputs] [--port 4317]
  agentsim tools
  agentsim approve <runId> <approvalId> [--out-dir outputs]
  agentsim reject <runId> <approvalId> [--out-dir outputs]
  agentsim resume <runId> [--mock|--live] [--out-dir outputs]
  pnpm agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  pnpm agentsim dashboard [runId] [--out-dir outputs]
  pnpm agentsim tui [runId] [--out-dir outputs]
  pnpm agentsim contexts [runId] [--out-dir outputs]
  pnpm agentsim context <runId> <contextPackageId> [--out-dir outputs]
  pnpm demo "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
