#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { z } from "zod";
import { loadDotEnv } from "./config.js";
import { LocalApprovalsRepo, LocalRunsRepo, LocalTasksRepo } from "./core/repositories.js";
import { loadRunInspection, renderApprovals, renderArtifacts, renderEvents, renderInspect, renderTasks } from "./inspection.js";
import { createModelProvider, type ProviderSelection } from "./providers/index.js";
import { startDashboard } from "./tui/run-inspector.js";
import { resumeOrchestrator } from "./orchestrator.js";
import { runDemo } from "./workflow.js";

type CliCommand = "run" | "demo" | "dashboard" | "tui" | "inspect" | "events" | "artifacts" | "tasks" | "approvals" | "approve" | "reject" | "resume";

interface CliOptions {
  command?: CliCommand | string;
  goal?: string;
  providerSelection: ProviderSelection;
  outputRoot: string;
  runId?: string;
  approvalId?: string;
}

const cliOptionsSchema = z.object({
  command: z.enum(["run", "demo", "dashboard", "tui", "inspect", "events", "artifacts", "tasks", "approvals", "approve", "reject", "resume"]).optional(),
  goal: z.string().trim().min(1).optional(),
  providerSelection: z.enum(["auto", "mock", "live"]),
  outputRoot: z.string().trim().min(1),
  runId: z.string().trim().min(1).optional(),
  approvalId: z.string().trim().min(1).optional()
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
      runId: options.runId ?? options.goal
    });
    return;
  }

  if (isInspectionCommand(options.command)) {
    const model = await loadRunInspection(resolve(options.outputRoot), options.runId ?? options.goal);
    const output = options.command === "inspect"
      ? renderInspect(model)
      : options.command === "events"
        ? renderEvents(model)
        : options.command === "artifacts"
          ? renderArtifacts(model)
          : options.command === "tasks"
            ? renderTasks(model)
            : renderApprovals(model);
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
      status: options.command === "approve" ? "approved" : "rejected"
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
    const provider = createModelProvider(options.providerSelection);
    const result = await resumeOrchestrator({
      outputRoot: resolve(options.outputRoot),
      runId: options.runId ?? options.goal ?? "",
      modelProvider: provider
    });
    console.log(`Agentsim run resumed.`);
    console.log(`Run ID: ${result.taskRun.id}`);
    console.log(`Status: ${result.taskRun.status}`);
    console.log(`Final package: ${result.finalPackageDir}`);
    return;
  }

  if (!options.goal) {
    console.error("Missing goal. Example: agentsim run \"Build an inventory request system for a flower company\"");
    process.exitCode = 1;
    return;
  }

  const provider = createModelProvider(options.providerSelection);
  const result = await runDemo({
    goal: options.goal,
    outputRoot: resolve(options.outputRoot),
    runId: options.runId,
    modelProvider: provider
  });

  console.log(`Agentsim run completed.`);
  console.log(`Run ID: ${result.taskRun.id}`);
  console.log(`Model mode: ${result.taskRun.modelMode}`);
  console.log(`Final package: ${result.finalPackageDir}`);
}

export function parseArgs(argv: string[]): CliOptions {
  let parsed: CliOptions = {
    providerSelection: "auto",
    outputRoot: "outputs"
  };

  const program = new Command();
  program
    .name("agentsim")
    .exitOverride()
    .allowExcessArguments(false)
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined
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
  addInspectionCommand(program, "approvals", (options) => {
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
  return command === "run" || command === "demo" || command === "dashboard" || command === "tui" ||
    command === "inspect" || command === "events" || command === "artifacts" || command === "tasks" ||
    command === "approvals" || command === "approve" || command === "reject" || command === "resume";
}

function isInspectionCommand(command: string | undefined): command is "inspect" | "events" | "artifacts" | "tasks" | "approvals" {
  return command === "inspect" || command === "events" || command === "artifacts" || command === "tasks" || command === "approvals";
}

function addRunCommand(program: Command, name: "run" | "demo", onParse: (options: CliOptions) => void): void {
  program
    .command(name)
    .argument("[goal...]", "client software goal")
    .option("--mock", "use deterministic mock model mode")
    .option("--live", "require configured live model mode")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .option("--run-id <id>", "stable run id")
    .action((goalParts: string[], flags: { mock?: boolean; live?: boolean; outDir: string; runId?: string }) => {
      if (flags.mock && flags.live) {
        throw new Error("Choose only one provider mode: --mock or --live.");
      }
      onParse({
        command: name,
        goal: goalParts.join(" ").trim() || undefined,
        providerSelection: flags.live ? "live" : flags.mock ? "mock" : "auto",
        outputRoot: flags.outDir,
        runId: flags.runId
      });
    });
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
        outputRoot: flags.outDir
      });
    });
}

function addInspectionCommand(program: Command, name: "inspect" | "events" | "artifacts" | "tasks" | "approvals", onParse: (options: CliOptions) => void): void {
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
        outputRoot: flags.outDir
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
        outputRoot: flags.outDir
      });
    });
}

function addResumeCommand(program: Command, onParse: (options: CliOptions) => void): void {
  program
    .command("resume")
    .argument("<runId>", "run id")
    .option("--out-dir <dir>", "output root directory", "outputs")
    .action((runId: string, flags: { outDir: string }) => {
      onParse({
        command: "resume",
        goal: runId,
        runId,
        providerSelection: "auto",
        outputRoot: flags.outDir
      });
    });
}

async function resolveApproval(input: { outputRoot: string; runId: string; approvalId: string; status: "approved" | "rejected" }): Promise<void> {
  const runRoot = resolve(input.outputRoot, input.runId);
  const approvalsRepo = new LocalApprovalsRepo(runRoot);
  const tasksRepo = new LocalTasksRepo(runRoot);
  const runsRepo = new LocalRunsRepo(runRoot);
  const approval = await approvalsRepo.updateApprovalStatus(input.approvalId, input.status);
  if (approval.taskId) {
    await tasksRepo.updateTaskStatus(
      approval.taskId,
      input.status === "approved" ? "ready" : "failed",
      input.status === "rejected" ? "Approval rejected." : undefined
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
  agentsim approvals [runId] [--out-dir outputs]
  agentsim approve <runId> <approvalId> [--out-dir outputs]
  agentsim reject <runId> <approvalId> [--out-dir outputs]
  agentsim resume <runId> [--out-dir outputs]
  pnpm agentsim run "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
  pnpm agentsim dashboard [runId] [--out-dir outputs]
  pnpm agentsim tui [runId] [--out-dir outputs]
  pnpm demo "Build an inventory request system for a flower company" [--mock|--live] [--out-dir outputs] [--run-id id]
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
